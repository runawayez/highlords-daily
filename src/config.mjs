import path from 'node:path';

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const config = {
  port: numberEnv('PORT', 8090),
  host: process.env.HOST || '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  ollamaHost: (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:4b',
  lookbackHours: numberEnv('LOOKBACK_HOURS', 48),
  refreshIntervalMinutes: numberEnv('REFRESH_INTERVAL_MINUTES', 120),
  refreshOnStart: booleanEnv('REFRESH_ON_START', false),
  maxItemsPerFeed: numberEnv('MAX_ITEMS_PER_FEED', 20),
  minScore: numberEnv('MIN_SCORE', 5)
};
