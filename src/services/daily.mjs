import { db, listCategories } from '../db.mjs';
import { config } from '../config.mjs';
import { curateDailyNewsletter } from './ollama.mjs';

function dateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = type => parts.find(part => part.type === type)?.value;
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function dailyDateKey(date = new Date()) {
  const { year, month, day } = dateParts(date);
  return `${year}-${month}-${day}`;
}

function rowToArticle(row) {
  return {
    ...row,
    imageUrl: row.imageUrl || null,
    tags: JSON.parse(row.tagsJson || '[]'),
    tagsJson: undefined
  };
}

function loadCandidates() {
  const categories = listCategories();
  const slugs = categories.map(category => category.slug);
  if (!slugs.length) return { categories, articles: [] };

  const placeholders = slugs.map(() => '?').join(',');
  const cutoff = new Date(Date.now() - config.dailyLookbackHours * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`
    SELECT id, source, original_title AS originalTitle, headline, link,
           published_at AS publishedAt, excerpt, summary, image_url AS imageUrl,
           category_slug AS category, score, tags_json AS tagsJson
    FROM articles
    WHERE processed = 1
      AND score >= ?
      AND category_slug IN (${placeholders})
      AND published_at >= ?
    ORDER BY score DESC, published_at DESC
    LIMIT 180
  `).all(config.minScore, ...slugs, cutoff);

  return { categories, articles: rows.map(rowToArticle) };
}

function decodeEditionRow(row) {
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json);
  } catch {
    return null;
  }
}

export function getDailyEdition(date = dailyDateKey()) {
  return decodeEditionRow(
    db.prepare('SELECT payload_json FROM daily_editions WHERE edition_date = ?').get(date)
  );
}

export function getLatestDailyEdition() {
  return decodeEditionRow(
    db.prepare('SELECT payload_json FROM daily_editions ORDER BY edition_date DESC LIMIT 1').get()
  );
}

export function listDailyArchive(limit = 30) {
  const capped = Math.max(1, Math.min(90, Number(limit) || 30));
  return db.prepare(`
    SELECT edition_date AS editionDate, generated_at AS generatedAt,
           curated_by AS curatedBy, story_count AS storyCount, payload_json AS payloadJson
    FROM daily_editions
    ORDER BY edition_date DESC
    LIMIT ?
  `).all(capped).map(row => {
    let title = 'Highlords Daily';
    try { title = JSON.parse(row.payloadJson)?.title || title; } catch {}
    return {
      editionDate: row.editionDate,
      generatedAt: row.generatedAt,
      curatedBy: row.curatedBy,
      storyCount: row.storyCount,
      title
    };
  });
}

function fallbackSelection(articles, categories) {
  const lead = articles[0] || null;
  const used = new Set(lead ? [lead.id] : []);
  const sections = {};

  for (const category of categories) {
    sections[category.slug] = articles
      .filter(article => article.category === category.slug && !used.has(article.id))
      .slice(0, config.dailyItemsPerCategory)
      .map(article => article.id);
    for (const id of sections[category.slug]) used.add(id);
  }

  return {
    title: 'O que vale sua atenção hoje',
    intro: 'Uma seleção curta das atualizações mais relevantes em tecnologia, sem política e sem excesso de ruído.',
    leadId: lead?.id || null,
    sections
  };
}

function normalizeSelection(curated, articles, categories, { backfill = false } = {}) {
  const byId = new Map(articles.map(article => [Number(article.id), article]));
  const leadCandidate = byId.get(Number(curated?.leadId));
  const lead = leadCandidate || articles[0] || null;
  const used = new Set(lead ? [lead.id] : []);
  const sections = [];

  for (const category of categories) {
    const requested = Array.isArray(curated?.sections?.[category.slug])
      ? curated.sections[category.slug]
      : [];
    const selected = [];

    for (const rawId of requested) {
      const article = byId.get(Number(rawId));
      if (!article || article.category !== category.slug || used.has(article.id)) continue;
      used.add(article.id);
      selected.push(article);
      if (selected.length >= config.dailyItemsPerCategory) break;
    }

    if (backfill && selected.length < config.dailyItemsPerCategory) {
      for (const article of articles) {
        if (article.category !== category.slug || used.has(article.id)) continue;
        used.add(article.id);
        selected.push(article);
        if (selected.length >= config.dailyItemsPerCategory) break;
      }
    }

    sections.push({
      slug: category.slug,
      name: category.name,
      articles: selected
    });
  }

  return { lead, sections };
}

function storeEdition(edition) {
  db.prepare(`
    INSERT INTO daily_editions (
      edition_date, generated_at, curated_by, story_count, payload_json
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(edition_date) DO UPDATE SET
      generated_at = excluded.generated_at,
      curated_by = excluded.curated_by,
      story_count = excluded.story_count,
      payload_json = excluded.payload_json
  `).run(
    edition.editionDate,
    edition.generatedAt,
    edition.curatedBy,
    edition.stats.stories,
    JSON.stringify(edition)
  );
}

export async function generateDailyEdition({ date = dailyDateKey(), force = false } = {}) {
  const existing = getDailyEdition(date);
  if (existing && !force) return existing;

  const { categories, articles } = loadCandidates();
  if (!articles.length) {
    const error = new Error('Nenhuma matéria recente e relevante está pronta para a newsletter. Atualize as fontes primeiro.');
    error.code = 'NO_DAILY_CANDIDATES';
    throw error;
  }

  let curated;
  let curatedBy = 'ranking';
  let backfill = true;
  try {
    curated = await curateDailyNewsletter(articles, categories, date);
    curatedBy = 'ollama';
    backfill = false;
  } catch {
    curated = fallbackSelection(articles, categories);
  }

  const { lead, sections } = normalizeSelection(curated, articles, categories, { backfill });
  const allStories = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  const edition = {
    editionDate: date,
    generatedAt: new Date().toISOString(),
    curatedBy,
    title: String(curated?.title || 'O que vale sua atenção hoje').trim().slice(0, 120),
    intro: String(curated?.intro || 'Uma seleção curta das atualizações mais relevantes em tecnologia, sem política e sem excesso de ruído.').trim().slice(0, 420),
    lead,
    sections,
    stats: {
      stories: allStories.length,
      sources: new Set(allStories.map(article => article.source)).size,
      candidates: articles.length
    }
  };

  storeEdition(edition);
  return edition;
}
