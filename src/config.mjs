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
  timeZone: process.env.TIME_ZONE || 'America/Sao_Paulo',
  lookbackHours: numberEnv('LOOKBACK_HOURS', 48),
  dailyLookbackHours: numberEnv('DAILY_LOOKBACK_HOURS', 48),
  dailyItemsPerCategory: Math.max(1, Math.min(3, numberEnv('DAILY_ITEMS_PER_CATEGORY', 2))),
  dailyAutoGenerate: booleanEnv('DAILY_AUTO_GENERATE', false),
  dailyGenerateHour: Math.max(0, Math.min(23, numberEnv('DAILY_GENERATE_HOUR', 8))),
  refreshIntervalMinutes: numberEnv('REFRESH_INTERVAL_MINUTES', 120),
  refreshOnStart: booleanEnv('REFRESH_ON_START', false),
  maxItemsPerFeed: numberEnv('MAX_ITEMS_PER_FEED', 12),
  maxProcessPerRun: numberEnv('MAX_PROCESS_PER_RUN', 36),
  analysisConcurrency: Math.max(1, Math.min(4, numberEnv('ANALYSIS_CONCURRENCY', 2))),
  minScore: numberEnv('MIN_SCORE', 5)
};
