import { db, listCategories, listFeeds } from '../db.mjs';
import { config } from '../config.mjs';
import { fetchFeed } from './rss.mjs';
import { analyzeArticle } from './ollama.mjs';

let refreshPromise = null;
let lastRun = null;

function setFeedStatus(id, error = null) {
  db.prepare(`
    UPDATE feeds
    SET last_fetched_at = ?, last_error = ?
    WHERE id = ?
  `).run(new Date().toISOString(), error, id);
}

function insertRaw(feedId, article) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO articles (
      feed_id, external_id, source, original_title, link, published_at, excerpt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    feedId,
    article.externalId || null,
    article.source,
    article.originalTitle,
    article.link,
    article.publishedAt,
    article.excerpt || ''
  );
  return Number(result.lastInsertRowid || 0);
}

function getUnprocessed(limit = 200) {
  return db.prepare(`
    SELECT id, source, original_title AS originalTitle, link,
           published_at AS publishedAt, excerpt
    FROM articles
    WHERE processed = 0
    ORDER BY published_at DESC, id DESC
    LIMIT ?
  `).all(limit);
}

function markProcessed(id, analysis) {
  db.prepare(`
    UPDATE articles
    SET headline = ?, summary = ?, category_slug = ?, score = ?,
        tags_json = ?, processed = 1, updated_at = ?
    WHERE id = ?
  `).run(
    analysis.headline,
    analysis.summary,
    analysis.category,
    analysis.score,
    JSON.stringify(analysis.tags),
    new Date().toISOString(),
    id
  );
}

async function runRefresh() {
  const startedAt = new Date().toISOString();
  const categories = listCategories().filter(category => category.enabled);
  const feeds = listFeeds().filter(feed => feed.enabled);
  let discovered = 0;
  let processed = 0;
  const errors = [];

  for (const feed of feeds) {
    try {
      const articles = await fetchFeed(feed);
      for (const article of articles) {
        const id = insertRaw(feed.id, article);
        if (id) discovered += 1;
      }
      setFeedStatus(feed.id);
    } catch (error) {
      const message = error.message || String(error);
      setFeedStatus(feed.id, message.slice(0, 500));
      errors.push(`${feed.name}: ${message}`);
    }
  }

  for (const article of getUnprocessed()) {
    try {
      const analysis = await analyzeArticle(article, categories);
      markProcessed(article.id, analysis);
      processed += 1;
    } catch (error) {
      errors.push(`Artigo ${article.id}: ${error.message || String(error)}`);
      break;
    }
  }

  lastRun = {
    startedAt,
    finishedAt: new Date().toISOString(),
    feeds: feeds.length,
    discovered,
    processed,
    errors: errors.slice(0, 20)
  };
  return lastRun;
}

export function refreshNews() {
  if (!refreshPromise) {
    refreshPromise = runRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function refreshStatus() {
  return { running: Boolean(refreshPromise), lastRun };
}

export function listArticles({ categories = [], limit = 80 } = {}) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const enabledCategories = categories.filter(Boolean);
  let rows;

  if (enabledCategories.length) {
    const placeholders = enabledCategories.map(() => '?').join(',');
    rows = db.prepare(`
      SELECT id, source, original_title AS originalTitle, headline, link,
             published_at AS publishedAt, excerpt, summary,
             category_slug AS category, score, tags_json AS tagsJson
      FROM articles
      WHERE processed = 1 AND score >= ? AND category_slug IN (${placeholders})
      ORDER BY score DESC, published_at DESC
      LIMIT ?
    `).all(config.minScore, ...enabledCategories, cappedLimit);
  } else {
    rows = db.prepare(`
      SELECT id, source, original_title AS originalTitle, headline, link,
             published_at AS publishedAt, excerpt, summary,
             category_slug AS category, score, tags_json AS tagsJson
      FROM articles
      WHERE processed = 1 AND score >= ? AND category_slug IS NOT NULL
      ORDER BY score DESC, published_at DESC
      LIMIT ?
    `).all(config.minScore, cappedLimit);
  }

  return rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tagsJson || '[]'),
    tagsJson: undefined
  }));
}

export function buildEdition(categorySlugs = []) {
  const categories = listCategories().filter(category => category.enabled);
  const selected = categorySlugs.length ? categorySlugs : categories.map(category => category.slug);
  const articles = listArticles({ categories: selected, limit: 120 });
  const lead = articles[0] || null;
  const byCategory = {};

  for (const category of categories) {
    if (!selected.includes(category.slug)) continue;
    byCategory[category.slug] = articles
      .filter(article => article.category === category.slug && article.id !== lead?.id)
      .slice(0, 8);
  }

  return {
    generatedAt: new Date().toISOString(),
    lead,
    sections: categories
      .filter(category => selected.includes(category.slug))
      .map(category => ({ ...category, articles: byCategory[category.slug] || [] }))
  };
}
