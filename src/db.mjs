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
  ['brasil', 'Brasil', 'Política pública, economia, sociedade, infraestrutura e acontecimentos relevantes no Brasil. Evite fofoca e celebridades.', 10],
  ['mundo', 'Mundo', 'Geopolítica, acontecimentos internacionais, economia global e fatos relevantes fora do Brasil.', 20],
  ['tecnologia', 'Tecnologia', 'Hardware, software, internet, dispositivos, segurança, open source e mudanças relevantes na indústria de tecnologia.', 30],
  ['ia', 'IA', 'Inteligência artificial, modelos de linguagem, agentes, pesquisa, ferramentas e impactos reais de IA.', 40],
  ['games', 'Games', 'PC gaming, consoles, Steam, jogos indie, RPGs, lançamentos e indústria de jogos. Evite esports salvo grandes acontecimentos.', 50],
  ['ciencia', 'Ciência', 'Pesquisa científica, espaço, física, biologia, medicina e descobertas com relevância pública.', 60],
  ['qa-dev', 'QA & Dev', 'Engenharia de software, QA, automação de testes, Playwright, CI/CD, DevOps, GitHub, MCP e ferramentas para desenvolvimento.', 70]
];

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO categories (slug, name, description, position)
  VALUES (?, ?, ?, ?)
`);
for (const row of seedCategories) insertCategory.run(...row);

const defaultFeeds = [
  ['Agência Brasil', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml'],
  ['Tecnoblog', 'https://tecnoblog.net/feed/'],
  ['The Verge', 'https://www.theverge.com/rss/index.xml'],
  ['Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
  ['BBC World', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
  ['The Guardian World', 'https://www.theguardian.com/world/rss'],
  ['Hacker News', 'https://news.ycombinator.com/rss']
];

const seedKey = 'default-feeds-v1';
const alreadySeeded = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(seedKey);
if (!alreadySeeded) {
  const insertFeed = db.prepare('INSERT OR IGNORE INTO feeds (name, url) VALUES (?, ?)');
  for (const feed of defaultFeeds) insertFeed.run(...feed);
  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(seedKey, new Date().toISOString());
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
