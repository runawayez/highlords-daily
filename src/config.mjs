import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeOllamaHost(value) {
  let host = String(value || 'http://127.0.0.1:11434').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
  return host;
}

function normalizeLocale(value) {
  const raw = String(value || 'pt-BR').trim();
  try {
    return new Intl.Locale(raw).toString();
  } catch {
    return 'pt-BR';
  }
}

function slug(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function color(value, fallback) {
  const raw = String(value || '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(raw) ? raw : fallback;
}

function imageMode(value) {
  if (value === false) return 'off';
  const normalized = String(value || 'auto').trim().toLowerCase();
  return normalized === 'page' ? 'page' : 'auto';
}

function loadYaml(filePath, label, { optional = false } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (optional && error.code === 'ENOENT') return {};
    throw new Error(`${label} não encontrado em ${filePath}: ${error.message}`);
  }

  try {
    return parseYaml(raw) || {};
  } catch (error) {
    throw new Error(`${label} inválido em ${filePath}: ${error.message}`);
  }
}

const presetName = slug(process.env.PRESET || 'br') || 'br';
const presetDir = path.resolve(process.env.PRESET_DIR || `./presets/${presetName}`);
const presetCategories = path.join(presetDir, 'categories.yml');
const presetFeeds = path.join(presetDir, 'feeds.yml');

const categoriesFile = path.resolve(
  process.env.CATEGORIES_FILE
  || (fs.existsSync(presetCategories) ? presetCategories : './config/categories.yml')
);
const feedsFile = path.resolve(
  process.env.FEEDS_FILE
  || (fs.existsSync(presetFeeds) ? presetFeeds : './config/feeds.yml')
);
const profilesFile = path.resolve(process.env.EDITORIAL_PROFILES_FILE || './config/editorial-profiles.yml');

const categoriesDocument = loadYaml(categoriesFile, 'Arquivo de categorias');
const feedsDocument = loadYaml(feedsFile, 'Arquivo de feeds');
const profilesDocument = loadYaml(profilesFile, 'Arquivo de perfis editoriais', { optional: true });

const rawCategories = Array.isArray(categoriesDocument.categories) ? categoriesDocument.categories : [];
export const categories = rawCategories
  .filter(category => category && category.enabled !== false)
  .map(category => ({
    slug: slug(category.slug || category.name),
    name: String(category.name || category.slug || '').trim(),
    description: String(category.description || '').trim(),
    aliases: Array.isArray(category.aliases)
      ? category.aliases.map(alias => String(alias).trim()).filter(Boolean)
      : []
  }))
  .filter(category => category.slug && category.name);

if (!categories.length) {
  throw new Error(`Nenhuma categoria habilitada em ${categoriesFile}.`);
}

const duplicateSlugs = categories
  .map(category => category.slug)
  .filter((value, index, all) => all.indexOf(value) !== index);
if (duplicateSlugs.length) {
  throw new Error(`Categorias com slug duplicado: ${[...new Set(duplicateSlugs)].join(', ')}`);
}

const validCategorySlugs = new Set(categories.map(category => category.slug));
const rawFeeds = Array.isArray(feedsDocument.feeds) ? feedsDocument.feeds : [];
export const feeds = rawFeeds
  .filter(feed => feed && feed.enabled !== false)
  .map(feed => ({
    name: String(feed.name || '').trim(),
    url: String(feed.url || '').trim(),
    imageMode: imageMode(feed.images),
    strictFocus: feed.strict_focus === true || feed.strictFocus === true,
    weight: Math.max(0.1, Number(feed.weight || 1)),
    focus: Array.isArray(feed.focus)
      ? feed.focus.map(value => slug(value)).filter(value => validCategorySlugs.has(value))
      : []
  }))
  .filter(feed => feed.name && /^https?:\/\//i.test(feed.url));

if (!feeds.length) {
  throw new Error(`Nenhum feed habilitado em ${feedsFile}.`);
}

const builtInProfiles = {
  balanced: {
    name: 'Balanced',
    description: 'Equilíbrio entre impacto, utilidade, novidade, diversidade de fontes e variedade de categorias.',
    tone: 'claro, sóbrio e direto',
    priorityCategories: [],
    itemsPerCategory: 2,
    maxItemsPerSource: 3,
    maxItemsPerSourcePerSection: 1
  },
  'tech-heavy': {
    name: 'Tech Heavy',
    description: 'Prioriza IA, desenvolvimento, hardware, software, mobile, games e tecnologias emergentes.',
    tone: 'técnico sem ser hermético',
    priorityCategories: ['ia', 'desenvolvimento', 'hardware', 'software-internet', 'mobile-gadgets', 'games', 'futuro'],
    itemsPerCategory: 2,
    maxItemsPerSource: 3,
    maxItemsPerSourcePerSection: 1
  },
  business: {
    name: 'Business',
    description: 'Prioriza economia, empresas, mercados, tecnologia com impacto comercial e movimentos de negócios.',
    tone: 'executivo, objetivo e contextual',
    priorityCategories: ['economia', 'ia', 'hardware', 'software-internet', 'futuro'],
    itemsPerCategory: 2,
    maxItemsPerSource: 3,
    maxItemsPerSourcePerSection: 1
  },
  gaming: {
    name: 'Gaming',
    description: 'Prioriza games, hardware, plataformas, estúdios e tecnologia relacionada a jogos.',
    tone: 'informativo e entusiasmado sem clickbait',
    priorityCategories: ['games', 'hardware', 'mobile-gadgets', 'software-internet'],
    itemsPerCategory: 2,
    maxItemsPerSource: 3,
    maxItemsPerSourcePerSection: 1
  },
  minimal: {
    name: 'Minimal',
    description: 'Edição enxuta, com menos histórias e foco apenas no que tem maior impacto e utilidade.',
    tone: 'minimalista, seco e informativo',
    priorityCategories: [],
    itemsPerCategory: 1,
    maxItemsPerSource: 2,
    maxItemsPerSourcePerSection: 1
  }
};

const configuredProfiles = profilesDocument?.profiles && typeof profilesDocument.profiles === 'object'
  ? profilesDocument.profiles
  : {};
const profileKey = slug(process.env.EDITORIAL_PROFILE || 'balanced') || 'balanced';
const profileRaw = configuredProfiles[profileKey] || builtInProfiles[profileKey] || builtInProfiles.balanced;
export const profile = {
  key: profileKey,
  name: String(profileRaw.name || profileKey).trim(),
  description: String(profileRaw.description || builtInProfiles.balanced.description).trim(),
  tone: String(profileRaw.tone || builtInProfiles.balanced.tone).trim(),
  priorityCategories: Array.isArray(profileRaw.priority_categories || profileRaw.priorityCategories)
    ? (profileRaw.priority_categories || profileRaw.priorityCategories).map(slug).filter(value => validCategorySlugs.has(value))
    : [],
  itemsPerCategory: Math.max(1, Math.min(3, Number(profileRaw.items_per_category || profileRaw.itemsPerCategory || 2))),
  maxItemsPerSource: Math.max(0, Number(profileRaw.max_items_per_source ?? profileRaw.maxItemsPerSource ?? 3)),
  maxItemsPerSourcePerSection: Math.max(0, Number(profileRaw.max_items_per_source_per_section ?? profileRaw.maxItemsPerSourcePerSection ?? 1))
};

export const publication = {
  name: String(process.env.PUBLICATION_NAME || 'Highlords Daily').trim() || 'Highlords Daily',
  tagline: String(process.env.PUBLICATION_TAGLINE || '').trim(),
  logoFile: path.resolve(process.env.PUBLICATION_LOGO || './public/assets/highlords-logo.svg'),
  accentColor: color(process.env.ACCENT_COLOR, '#c92f2b'),
  paperColor: color(process.env.PAPER_COLOR, '#f7f3e9'),
  backgroundColor: color(process.env.BACKGROUND_COLOR, '#0b0b0d'),
  slug: slug(process.env.PUBLICATION_SLUG || process.env.PUBLICATION_NAME || 'highlords-daily') || 'highlords-daily'
};

export const editorial = {
  preset: String(categoriesDocument.preset || feedsDocument.preset || presetName || 'custom'),
  presetName,
  presetDir,
  profile: profile.key,
  categoriesFile,
  feedsFile,
  profilesFile
};

export const config = {
  ollamaHost: normalizeOllamaHost(process.env.OLLAMA_HOST),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:4b',
  language: normalizeLocale(process.env.LANGUAGE || 'pt-BR'),
  editorialContext: String(process.env.EDITORIAL_CONTEXT || 'Brasil').trim() || 'Brasil',
  timeZone: process.env.TIME_ZONE || 'America/Sao_Paulo',
  outputDir: path.resolve(process.env.OUTPUT_DIR || './output'),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  memoryFile: path.resolve(process.env.MEMORY_FILE || './data/highlords.sqlite'),
  pluginsDir: path.resolve(process.env.PLUGINS_DIR || './plugins'),
  lookbackHours: Math.max(12, numberEnv('LOOKBACK_HOURS', 48)),
  maxItemsPerFeed: Math.max(3, numberEnv('MAX_ITEMS_PER_FEED', 12)),
  maxCandidates: Math.max(20, numberEnv('MAX_CANDIDATES', 96)),
  aiBatchSize: Math.max(4, Math.min(16, numberEnv('AI_BATCH_SIZE', 10))),
  itemsPerCategory: Math.max(1, Math.min(3, numberEnv('ITEMS_PER_CATEGORY', profile.itemsPerCategory))),
  llmMinScore: Math.max(0, Math.min(10, numberEnv('LLM_MIN_SCORE', 4.5))),
  maxItemsPerSource: Math.max(0, numberEnv('MAX_ITEMS_PER_SOURCE', profile.maxItemsPerSource)),
  maxItemsPerSourcePerSection: Math.max(0, numberEnv('MAX_ITEMS_PER_SOURCE_PER_SECTION', profile.maxItemsPerSourcePerSection)),
  sourceDiversityStrict: booleanEnv('SOURCE_DIVERSITY_STRICT', false),
  requireImages: booleanEnv('REQUIRE_IMAGES', true),
  cacheImages: booleanEnv('CACHE_IMAGES', true),
  historyEnabled: booleanEnv('HISTORY_ENABLED', true),
  historyDays: Math.max(7, numberEnv('HISTORY_DAYS', 90)),
  duplicateDays: Math.max(1, numberEnv('DUPLICATE_DAYS', 7)),
  duplicateThreshold: Math.max(0.45, Math.min(0.95, numberEnv('DUPLICATE_THRESHOLD', 0.72))),
  exportMarkdown: booleanEnv('EXPORT_MARKDOWN', true),
  exportEmail: booleanEnv('EXPORT_EMAIL', true),
  exportSocial: booleanEnv('EXPORT_SOCIAL', true),
  archiveEnabled: booleanEnv('ARCHIVE_ENABLED', true),
  pluginsEnabled: booleanEnv('PLUGINS_ENABLED', true),
  autoOpen: booleanEnv('AUTO_OPEN', true)
};
