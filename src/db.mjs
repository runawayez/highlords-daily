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

// A navegação não possui uma categoria genérica "Tecnologia". "Todos" já cumpre
// esse papel. Cada notícia deve cair na seção mais específica possível e usar
// tags para representar assuntos secundários, marcas e tecnologias relacionadas.
const seedCategories = [
  ['ia', 'IA', 'Inteligência artificial como assunto principal: OpenAI, Anthropic, Gemini, LLMs, modelos multimodais, agentes, machine learning, geração de imagem ou vídeo, ferramentas e produtos de IA. Chips entram aqui apenas quando a história é principalmente sobre IA; caso contrário use Hardware.', 10],
  ['desenvolvimento', 'Desenvolvimento', 'Programação e engenharia de software: linguagens, frameworks, bibliotecas, APIs, bancos de dados, GitHub, GitLab, IDEs, SDKs, open source, QA, testes, automação, DevOps, cloud, containers, CI/CD e ferramentas para desenvolvedores.', 20],
  ['mobile-gadgets', 'Mobile & Gadgets', 'Smartphones, tablets, smartwatches, wearables, fones, smart home, acessórios e gadgets de consumo. Priorize lançamentos, updates relevantes, comparativos técnicos e novos recursos de dispositivos.', 30],
  ['hardware', 'Hardware', 'CPUs, GPUs, PCs, notebooks, monitores, periféricos, armazenamento, memória, placas, semicondutores e componentes. Hardware gamer continua aqui quando o foco é o componente; use Games quando o foco principal é jogar ou uma plataforma de jogos.', 40],
  ['software-internet', 'Software & Internet', 'Sistemas operacionais, Windows, Linux, macOS, Android e iOS quando o foco é software; browsers, aplicativos, serviços digitais, segurança, privacidade, web, redes, plataformas e mudanças relevantes da internet.', 50],
  ['games', 'Games', 'Jogos de PC e console, Steam, PlayStation, Xbox, Nintendo, indies, RPGs, lançamentos, updates de jogos, estúdios, engines e desenvolvimento de games. Evite esports, celebridades e drama sem relevância para jogos.', 60],
  ['futuro', 'Futuro', 'Tecnologias emergentes e pesquisa aplicada: robótica, computação quântica, realidade virtual ou aumentada, computação espacial, novas interfaces, protótipos e tecnologias experimentais com potencial prático.', 70]
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

// v0.8: remove fontes de notícias gerais e política de instalações antigas.
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

    UPDATE articles
    SET headline = NULL,
        summary = NULL,
        category_slug = NULL,
        score = 0,
        tags_json = '[]',
        processed = 0,
        updated_at = CURRENT_TIMESTAMP;
  `);

  const insertFeed = db.prepare('INSERT OR IGNORE INTO feeds (name, url) VALUES (?, ?)');
  for (const feed of defaultFeeds) insertFeed.run(...feed);

  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(focusMigrationKey, new Date().toISOString());
}

// v0.9: troca o guarda-chuva "Tecnologia" por sete seções específicas.
// A migração roda uma única vez e reclassifica o acervo com a nova taxonomia.
const taxonomyMigrationKey = 'editorial-taxonomy-v2';
const taxonomyMigrated = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(taxonomyMigrationKey);
if (!taxonomyMigrated) {
  db.exec(`
    DELETE FROM categories WHERE slug IN ('tecnologia', 'qa-dev', 'inovacao');
    UPDATE categories SET enabled = 0;
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

  db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run(taxonomyMigrationKey, new Date().toISOString());
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
