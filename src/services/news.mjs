import { db, listCategories, listFeeds } from '../db.mjs';
import { config } from '../config.mjs';
import { fetchFeed } from './rss.mjs';
import { analyzeArticle, curateEdition } from './ollama.mjs';

let refreshPromise = null;
let lastRun = null;
const editionCache = new Map();

function clearEditionCache() {
  editionCache.clear();
}

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

  clearEditionCache();
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

export function invalidateEditions() {
  clearEditionCache();
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

function fallbackEdition(articles, categories) {
  const lead = articles[0] || null;
  return {
    lead,
    sections: categories.map(category => ({
      ...category,
      articles: articles
        .filter(article => article.category === category.slug && article.id !== lead?.id)
        .slice(0, 6)
    }))
  };
}

function normalizeCuratedEdition(curated, articles, categories) {
  const byId = new Map(articles.map(article => [Number(article.id), article]));
  const bySlug = new Map(categories.map(category => [category.slug, category]));
  const used = new Set();

  const leadId = Number(curated?.leadId);
  const lead = byId.get(leadId) || articles[0] || null;
  if (lead) used.add(lead.id);

  const requestedOrder = Array.isArray(curated?.sectionOrder) ? curated.sectionOrder : [];
  const order = [
    ...requestedOrder.filter(slug => bySlug.has(slug)),
    ...categories.map(category => category.slug).filter(slug => !requestedOrder.includes(slug))
  ];

  const sections = [];
  for (const slug of order) {
    const category = bySlug.get(slug);
    if (!category) continue;
    const requestedIds = Array.isArray(curated?.sections?.[slug]) ? curated.sections[slug] : [];
    const selected = [];

    for (const rawId of requestedIds) {
      const id = Number(rawId);
      const article = byId.get(id);
      if (!article || article.category !== slug || used.has(id)) continue;
      used.add(id);
      selected.push(article);
      if (selected.length >= 6) break;
    }

    if (selected.length < 3) {
      for (const article of articles) {
        if (article.category !== slug || used.has(article.id)) continue;
        used.add(article.id);
        selected.push(article);
        if (selected.length >= 6) break;
      }
    }

    sections.push({ ...category, articles: selected });
  }

  return { lead, sections };
}

export async function buildEdition(categorySlugs = []) {
  const allCategories = listCategories().filter(category => category.enabled);
  const selectedSlugs = categorySlugs.length
    ? categorySlugs.filter(slug => allCategories.some(category => category.slug === slug))
    : allCategories.map(category => category.slug);
  const categories = allCategories.filter(category => selectedSlugs.includes(category.slug));
  const articles = listArticles({ categories: selectedSlugs, limit: 120 });
  const cacheKey = [...selectedSlugs].sort().join(',') || 'all';
  const newest = articles.reduce((latest, article) => {
    const stamp = article.publishedAt || '';
    return stamp > latest ? stamp : latest;
  }, '');
  const signature = `${cacheKey}|${articles.length}|${newest}|${articles[0]?.id || 0}`;
  const cached = editionCache.get(signature);
  if (cached && Date.now() - cached.createdAt < 10 * 60 * 1000) return cached.value;

  let arranged = fallbackEdition(articles, categories);
  let curatedBy = 'ranking';

  if (articles.length >= 2) {
    try {
      const curated = await curateEdition(articles, categories);
      arranged = normalizeCuratedEdition(curated, articles, categories);
      curatedBy = 'ollama';
    } catch {
      curatedBy = 'ranking';
    }
  }

  const value = {
    generatedAt: new Date().toISOString(),
    curatedBy,
    lead: arranged.lead,
    sections: arranged.sections
  };
  editionCache.set(signature, { createdAt: Date.now(), value });
  return value;
}
