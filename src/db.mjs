import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.mjs';

fs.mkdirSync(config.dataDir, { recursive: true });

const legacyDbPath = path.join(config.dataDir, 'highlords-post.db');
const dbPath = path.join(config.dataDir, 'highlords-daily.db');

if (!fs.existsSync(dbPath) && fs.existsSync(legacyDbPath)) {
  for (const suffix of ['', '-wal', '-shm']) {
    const from = `${legacyDbPath}${suffix}`;
    const to = `${dbPath}${suffix}`;
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
}

export const db = new DatabaseSync(dbPath);

export const FIXED_CATEGORIES = [
  ['ia', 'IA', 'Inteligência artificial como assunto principal: OpenAI, Anthropic, Gemini, LLMs, modelos multimodais, agentes, machine learning, geração de imagem ou vídeo, ferramentas e produtos de IA.', 10],
  ['desenvolvimento', 'Desenvolvimento', 'Programação e engenharia de software: linguagens, frameworks, bibliotecas, APIs, bancos de dados, GitHub, GitLab, IDEs, SDKs, open source, QA, testes, automação, DevOps, cloud, containers e CI/CD.', 20],
  ['mobile-gadgets', 'Mobile & Gadgets', 'Smartphones, tablets, smartwatches, wearables, fones, smart home, acessórios e gadgets de consumo. Priorize lançamentos, updates relevantes e novos recursos de dispositivos.', 30],
  ['hardware', 'Hardware', 'CPUs, GPUs, PCs, notebooks, monitores, periféricos, armazenamento, memória, placas, chips, semicondutores e componentes.', 40],
  ['software-internet', 'Software & Internet', 'Sistemas operacionais, Windows, Linux, macOS, Android e iOS quando o foco é software; browsers, aplicativos, serviços digitais, segurança, privacidade, web, redes e plataformas.', 50],
  ['games', 'Games', 'Jogos de PC e console, Steam, PlayStation, Xbox, Nintendo, indies, RPGs, lançamentos, updates de jogos, estúdios, engines e desenvolvimento de games.', 60],
  ['futuro', 'Futuro', 'Tecnologias emergentes e pesquisa aplicada: robótica, computação quântica, realidade virtual ou aumentada, computação espacial, novas interfaces, protótipos e tecnologias experimentais.', 70]
];

export const FIXED_CATEGORY_SLUGS = FIXED_CATEGORIES.map(([slug]) => slug);

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
    image_url TEXT,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS daily_editions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_date TEXT NOT NULL UNIQUE,
    generated_at TEXT NOT NULL,
    curated_by TEXT NOT NULL,
    story_count INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_slug, score DESC);
  CREATE INDEX IF NOT EXISTS idx_daily_editions_date ON daily_editions(edition_date DESC);
`);

const articleColumns = new Set(db.prepare('PRAGMA table_info(articles)').all().map(column => column.name));
if (!articleColumns.has('image_url')) db.exec('ALTER TABLE articles ADD COLUMN image_url TEXT');

const upsertCategory = db.prepare(`
  INSERT INTO categories (slug, name, description, position, enabled)
  VALUES (?, ?, ?, ?, 1)
  ON CONFLICT(slug) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    position = excluded.position,
    enabled = 1
`);
for (const row of FIXED_CATEGORIES) upsertCategory.run(...row);

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
if (!db.prepare('SELECT value FROM app_meta WHERE key = ?').get(seedKey)) {
  const insertFeed = db.prepare('INSERT OR IGNORE INTO feeds (name, url) VALUES (?, ?)');
  for (const feed of defaultFeeds) insertFeed.run(...feed);
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(seedKey, new Date().toISOString());
}

const dailyMigrationKey = 'highlords-daily-v1';
if (!db.prepare('SELECT value FROM app_meta WHERE key = ?').get(dailyMigrationKey)) {
  const placeholders = FIXED_CATEGORY_SLUGS.map(() => '?').join(',');

  db.prepare(`
    UPDATE articles
    SET headline = NULL,
        summary = NULL,
        category_slug = NULL,
        score = 0,
        tags_json = '[]',
        processed = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE category_slug IS NOT NULL AND category_slug NOT IN (${placeholders})
  `).run(...FIXED_CATEGORY_SLUGS);

  db.prepare(`DELETE FROM categories WHERE slug NOT IN (${placeholders})`).run(...FIXED_CATEGORY_SLUGS);
  for (const row of FIXED_CATEGORIES) upsertCategory.run(...row);

  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(dailyMigrationKey, new Date().toISOString());
}

export function listCategories() {
  return db.prepare(`
    SELECT id, slug, name, description, position, enabled
    FROM categories
    WHERE enabled = 1
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
