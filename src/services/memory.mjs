import { normalizeText as normalizeText, wordTokens } from "../utils/text.mjs";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { config } from "../config.mjs";

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "sem",
  "sobre",
  "que",
  "como",
  "mais",
  "menos",
  "novo",
  "nova",
  "novos",
  "novas",
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "with",
  "without",
  "from",
  "by",
  "is",
  "are",
  "new",
  "how",
  "why",
  "this",
  "that",
  "these",
  "those",
  "will",
  "has",
  "have",
  "its",
  "their",
]);

let sqlitePromise;
let sqliteDb;
let warnedFallback = false;

function tokenSet(value = "", language = config.language) {
  return new Set(wordTokens(value, language, STOPWORDS));
}

function overlapScore(a, b, languageA, languageB) {
  const left = tokenSet(a, languageA);
  const right = tokenSet(b, languageB);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.min(left.size, right.size);
  return Math.max(jaccard, containment * 0.92);
}

export function storyFingerprint(article = {}) {
  const topicKey = normalizeText(article.topicKey || "");
  if (topicKey) return topicKey;
  const title = article.headline || article.originalTitle || "";
  const tags = Array.isArray(article.tags) ? article.tags.join(" ") : "";
  const tokens = [...tokenSet(`${title} ${tags}`)].sort();
  return tokens.slice(0, 18).join(" ");
}

export function articleSimilarity(a = {}, b = {}) {
  if (a.link && b.link && String(a.link) === String(b.link)) return 1;
  const topicA = normalizeText(a.topicKey || "");
  const topicB = normalizeText(b.topicKey || "");
  if (topicA && topicB && topicA === topicB) return 1;

  const titleA = a.headline || a.originalTitle || a.title || "";
  const titleB = b.headline || b.originalTitle || b.title || "";
  const titleScore = overlapScore(
    titleA,
    titleB,
    a.language || config.language,
    b.language || config.language,
  );
  const fingerprintScore = overlapScore(
    storyFingerprint(a),
    storyFingerprint(b),
  );
  return Math.max(titleScore, fingerprintScore);
}

function betterArticle(a, b) {
  const scoreDiff = Number(a.score || 0) - Number(b.score || 0);
  if (scoreDiff !== 0) return scoreDiff > 0 ? a : b;
  return new Date(a.publishedAt || 0) >= new Date(b.publishedAt || 0) ? a : b;
}

export function deduplicateArticles(
  input = [],
  threshold = config.duplicateThreshold,
) {
  const articles = [];
  const duplicates = [];

  for (const candidate of input) {
    let duplicateIndex = -1;
    let similarity = 0;
    for (let index = 0; index < articles.length; index += 1) {
      const score = articleSimilarity(candidate, articles[index]);
      if (score >= threshold && score > similarity) {
        duplicateIndex = index;
        similarity = score;
      }
    }

    if (duplicateIndex < 0) {
      articles.push(candidate);
      continue;
    }

    const existing = articles[duplicateIndex];
    const winner = betterArticle(candidate, existing);
    const loser = winner === candidate ? existing : candidate;
    articles[duplicateIndex] = winner;
    duplicates.push({ kept: winner, removed: loser, similarity });
  }

  // Final image enforcement runs after editorial selection. Keep the complete
  // deduplicated candidate pool available in-process so a failed image can be
  // replaced by the next best story from the same category without another AI pass.
  return { articles, duplicates };
}

async function openSqlite() {
  if (sqlitePromise) return sqlitePromise;
  sqlitePromise = (async () => {
    try {
      const module = await import("node:sqlite");
      if (!module.DatabaseSync) return null;
      fsSync.mkdirSync(path.dirname(config.memoryFile), { recursive: true });
      sqliteDb = new module.DatabaseSync(config.memoryFile);
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS published_stories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          edition_date TEXT NOT NULL,
          link TEXT NOT NULL,
          source TEXT,
          original_title TEXT,
          headline TEXT,
          category TEXT,
          topic_key TEXT,
          fingerprint TEXT,
          published_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_published_link ON published_stories(link);
        CREATE INDEX IF NOT EXISTS idx_published_edition ON published_stories(edition_date);
        CREATE INDEX IF NOT EXISTS idx_published_topic ON published_stories(topic_key);
      `);
      return sqliteDb;
    } catch {
      if (!warnedFallback) {
        warnedFallback = true;
        console.log(
          "  Memória SQLite indisponível neste Node; usando fallback JSON local.",
        );
      }
      return null;
    }
  })();
  return sqlitePromise;
}

function fallbackFile() {
  const parsed = path.parse(config.memoryFile);
  return path.join(parsed.dir, `${parsed.name}.json`);
}

async function loadFallback() {
  try {
    return JSON.parse(await fs.readFile(fallbackFile(), "utf8"));
  } catch {
    return { stories: [] };
  }
}

async function saveFallback(data) {
  await fs.mkdir(path.dirname(fallbackFile()), { recursive: true });
  await fs.writeFile(fallbackFile(), JSON.stringify(data, null, 2), "utf8");
}

function cutoffDate(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export async function recentPublishedStories(days = config.duplicateDays) {
  if (!config.historyEnabled) return [];
  const cutoff = cutoffDate(days);
  const db = await openSqlite();
  if (db) {
    return db
      .prepare(
        `
      SELECT edition_date AS editionDate, link, source,
             original_title AS originalTitle, headline, category,
             topic_key AS topicKey, fingerprint, published_at AS publishedAt
      FROM published_stories
      WHERE edition_date >= ?
      ORDER BY edition_date DESC, id DESC
    `,
      )
      .all(cutoff);
  }

  const data = await loadFallback();
  return (Array.isArray(data.stories) ? data.stories : [])
    .filter((story) => String(story.editionDate || "") >= cutoff)
    .sort((a, b) =>
      String(b.editionDate || "").localeCompare(String(a.editionDate || "")),
    );
}

export async function filterPreviouslyPublished(
  input = [],
  threshold = config.duplicateThreshold,
) {
  if (!config.historyEnabled) return { articles: input, rejected: [] };
  const history = await recentPublishedStories(config.duplicateDays);
  if (!history.length) return { articles: input, rejected: [] };

  const articles = [];
  const rejected = [];
  for (const candidate of input) {
    let match = null;
    let similarity = 0;
    for (const published of history) {
      const score = articleSimilarity(candidate, published);
      if (score >= threshold && score > similarity) {
        match = published;
        similarity = score;
      }
    }
    if (match) rejected.push({ article: candidate, match, similarity });
    else articles.push(candidate);
  }
  return { articles, rejected };
}

function selectedStories(edition) {
  const stories = [
    edition?.lead,
    ...(edition?.topStories || []),
    ...(edition?.sections || []).flatMap((section) => section.articles || []),
  ].filter(Boolean);
  const seen = new Set();
  return stories.filter((story) => {
    const key = story.link || story.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function rememberEdition(edition) {
  if (!config.historyEnabled || !edition?.editionDate) return 0;
  const stories = selectedStories(edition);
  const db = await openSqlite();
  const now = new Date().toISOString();

  if (db) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO published_stories
        (edition_date, link, source, original_title, headline, category, topic_key, fingerprint, published_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let inserted = 0;
    for (const story of stories) {
      const result = insert.run(
        edition.editionDate,
        String(story.link || ""),
        String(story.source || ""),
        String(story.originalTitle || ""),
        String(story.headline || ""),
        String(story.category || ""),
        String(story.topicKey || ""),
        storyFingerprint(story),
        String(story.publishedAt || ""),
        now,
      );
      inserted += Number(result.changes || 0);
    }
    return inserted;
  }

  const data = await loadFallback();
  const existing = new Set((data.stories || []).map((story) => story.link));
  let inserted = 0;
  for (const story of stories) {
    if (!story.link || existing.has(story.link)) continue;
    data.stories.push({
      editionDate: edition.editionDate,
      link: story.link,
      source: story.source,
      originalTitle: story.originalTitle,
      headline: story.headline,
      category: story.category,
      topicKey: story.topicKey,
      fingerprint: storyFingerprint(story),
      publishedAt: story.publishedAt,
      createdAt: now,
    });
    existing.add(story.link);
    inserted += 1;
  }
  const cutoff = cutoffDate(config.historyDays);
  data.stories = data.stories.filter(
    (story) => String(story.editionDate || "") >= cutoff,
  );
  await saveFallback(data);
  return inserted;
}

export async function pruneHistory(days = config.historyDays) {
  if (!config.historyEnabled) return 0;
  const cutoff = cutoffDate(days);
  const db = await openSqlite();
  if (db) {
    const result = db
      .prepare("DELETE FROM published_stories WHERE edition_date < ?")
      .run(cutoff);
    return Number(result.changes || 0);
  }

  const data = await loadFallback();
  const before = Array.isArray(data.stories) ? data.stories.length : 0;
  data.stories = (data.stories || []).filter(
    (story) => String(story.editionDate || "") >= cutoff,
  );
  await saveFallback(data);
  return before - data.stories.length;
}
