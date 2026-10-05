import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });

const dbPath = path.join(config.dataDir, 'highlords-post.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS feeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at TEXT,
    last_error TEXT
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id INTEGER,
    external_id TEXT,
    source TEXT NOT NULL,
    original_title TEXT NOT NULL,
    headline TEXT,
    link TEXT NOT NULL UNIQUE,
    published_at TEXT,
    excerpt TEXT,
    summary TEXT,
    category_slug TEXT,
    score REAL NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL DEFAULT '[]',
    processed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_slug, score DESC);
`);

const articleColumns = new Set(db.prepare('PRAGMA table_info(articles)').all().map(column => column.name));
if (!articleColumns.has('image_url')) {
  db.exec('ALTER TABLE articles ADD COLUMN image_url TEXT');
}

const seedCategories = [
  ['tecnologia', 'Tecnologia', 'Hardware, software e produtos de tecnologia de uso geral: dispositivos, PCs, smartphones, chips, sistemas operacionais, browsers, internet, segurança e open source. Use como categoria guarda-chuva apenas quando IA, Desenvolvimento, Games ou Inovação não forem mais específicas.', 10],
  ['ia', 'IA', 'Inteligência artificial, modelos de linguagem, agentes, machine learning, OpenAI, Anthropic, Gemini, pesquisa aplicada, ferramentas, chips para IA, produtos e usos práticos cujo assunto central seja IA.', 20],
  ['qa-dev', 'Desenvolvimento', 'Engenharia de software, programação, QA, automação de testes, Playwright, frameworks, linguagens, APIs, bancos de dados, DevOps, cloud, GitHub, CI/CD, IDEs e ferramentas para desenvolvedores.', 30],
  ['games', 'Games', 'Jogos de PC e console, Steam, indies, RPGs, lançamentos, plataformas, engines, estúdios, hardware gamer e desenvolvimento de jogos. Evite esports e celebridades.', 40],
  ['inovacao', 'Inovação', 'Robótica, computação quântica, realidade virtual e aumentada, interfaces emergentes, protótipos, wearables, computação espacial e tecnologias experimentais com potencial prático.', 50]
];

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (slug, name, description, position)
  VALUES (?, ?, ?, ?)
`);
for (const row of seedCategories) insertCategory.run(...row);

const defaultFeeds = [
  ['Tecnoblog', 'https://tecnoblog.net/feed/'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
  ['Hacker News', 'https://news.ycombinator.com/rss'],
  ['TechCrunch', 'https://techcrunch.com/feed/'],
  ['GitHub Blog', 'https://github.blog/feed/'],
  ['InfoQ', 'https://feed.infoq.com/'],
  ["Tom's Hardware", 'https://www.tomshardware.com/feeds/all'],
  ['Rock Paper Shotgun', 'https://www.rockpapershotgun.com/feed']
];

const seedKey = 'default-feeds-v2';
const alreadySeeded = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(seedKey);
if (!alreadySeeded) {
  const insertFeed = db.prepare('INSERT OR IGNORE INTO feeds (name, url) VALUES (?, ?)');
  for (const feed of defaultFeeds) insertFeed.run(...feed);
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(seedKey, new Date().toISOString());
}

// v0.8 changes the editorial scope from general news to a calm technology reader.
const focusMigrationKey = 'tech-focus-v1';
const focusMigrated = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(focusMigrationKey);
if (!focusMigrated) {
  db.exec(`
    DELETE FROM articles
    WHERE source IN ('Agência Brasil', 'BBC World', 'The Guardian World')
       OR category_slug IN ('brasil', 'mundo', 'ciencia');

    DELETE FROM feeds
    WHERE url IN (
      'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.theguardian.com/world/rss'
    );

    DELETE FROM categories WHERE slug IN ('brasil', 'mundo', 'ciencia');

    UPDATE categories
    SET enabled = 0
    WHERE slug NOT IN ('tecnologia', 'ia', 'qa-dev', 'games', 'inovacao');

    UPDATE articles
    SET headline = NULL,
        summary = NULL,
        category_slug = NULL,
        score = 0,
        tags_json = '[]',
        processed = 0,
        updated_at = CURRENT_TIMESTAMP;
  `);

  const upsertCategory = db.prepare(`
    INSERT INTO categories (slug, name, description, position, enabled)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      position = excluded.position,
      enabled = 1
  `);
  for (const row of seedCategories) upsertCategory.run(...row);

  const insertFeed = db.prepare('INSERT OR IGNORE INTO feeds (name, url) VALUES (?, ?)');
  for (const feed of defaultFeeds) insertFeed.run(...feed);

  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(focusMigrationKey, new Date().toISOString());
}

// v0.8.1 makes Tecnologia a fallback instead of swallowing AI/Dev/Games/Innovation.
// Reclassify existing tech-focused stories once with the stricter classifier.
const categorySpecificityKey = 'category-specificity-v1';
const categorySpecificityMigrated = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(categorySpecificityKey);
if (!categorySpecificityMigrated) {
  const upsertCategory = db.prepare(`
    INSERT INTO categories (slug, name, description, position, enabled)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      position = excluded.position,
      enabled = 1
  `);
  for (const row of seedCategories) upsertCategory.run(...row);

  db.exec(`
    UPDATE articles
    SET headline = NULL,
        summary = NULL,
        category_slug = NULL,
        score = 0,
        tags_json = '[]',
        processed = 0,
        updated_at = CURRENT_TIMESTAMP;
  `);
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(categorySpecificityKey, new Date().toISOString());
}

export function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function listCategories() {
  return db.prepare(`
    SELECT id, slug, name, description, position, enabled
    FROM categories
    ORDER BY position ASC, id ASC
  `).all().map(row => ({ ...row, enabled: Boolean(row.enabled) }));
}

export function listFeeds() {
  return db.prepare(`
    SELECT id, name, url, enabled, created_at AS createdAt,
           last_fetched_at AS lastFetchedAt, last_error AS lastError
    FROM feeds
    ORDER BY name COLLATE NOCASE ASC
  `).all().map(row => ({ ...row, enabled: Boolean(row.enabled) }));
}
