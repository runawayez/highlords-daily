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

function loadYaml(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`${label} não encontrado em ${filePath}: ${error.message}`);
  }

  try {
    return parseYaml(raw) || {};
  } catch (error) {
    throw new Error(`${label} inválido em ${filePath}: ${error.message}`);
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

const categoriesFile = path.resolve(process.env.CATEGORIES_FILE || './config/categories.yml');
const feedsFile = path.resolve(process.env.FEEDS_FILE || './config/feeds.yml');
const categoriesDocument = loadYaml(categoriesFile, 'Arquivo de categorias');
const feedsDocument = loadYaml(feedsFile, 'Arquivo de feeds');

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
    focus: Array.isArray(feed.focus)
      ? feed.focus.map(value => slug(value)).filter(value => validCategorySlugs.has(value))
      : []
  }))
  .filter(feed => feed.name && /^https?:\/\//i.test(feed.url));

if (!feeds.length) {
  throw new Error(`Nenhum feed habilitado em ${feedsFile}.`);
}

export const editorial = {
  preset: String(categoriesDocument.preset || feedsDocument.preset || 'custom'),
  categoriesFile,
  feedsFile
};

export const config = {
  ollamaHost: (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:4b',
  timeZone: process.env.TIME_ZONE || 'America/Sao_Paulo',
  outputDir: path.resolve(process.env.OUTPUT_DIR || './output'),
  lookbackHours: Math.max(12, numberEnv('LOOKBACK_HOURS', 48)),
  maxItemsPerFeed: Math.max(3, numberEnv('MAX_ITEMS_PER_FEED', 12)),
  maxCandidates: Math.max(20, numberEnv('MAX_CANDIDATES', 72)),
  aiBatchSize: Math.max(4, Math.min(16, numberEnv('AI_BATCH_SIZE', 10))),
  itemsPerCategory: Math.max(1, Math.min(3, numberEnv('ITEMS_PER_CATEGORY', 2))),
  llmMinScore: Math.max(0, Math.min(10, numberEnv('LLM_MIN_SCORE', 4.5))),
  autoOpen: booleanEnv('AUTO_OPEN', true)
};
