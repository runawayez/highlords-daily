import { parseEnv } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
const fields = {
  preset: "PRESET",
  presetDir: "PRESET_DIR",
  language: "LANGUAGE",
  region: "REGION",
  coverage: "COVERAGE",
  sourceLanguages: "SOURCE_LANGUAGES",
  timeZone: "TIME_ZONE",
  editorialContext: "EDITORIAL_CONTEXT",
  publicationName: "PUBLICATION_NAME",
  publicationSlug: "PUBLICATION_SLUG",
  publicationTagline: "PUBLICATION_TAGLINE",
  categoriesFile: "CATEGORIES_FILE",
  feedsFile: "FEEDS_FILE",
  dataDir: "DATA_DIR",
  outputDir: "OUTPUT_DIR",
  memoryFile: "MEMORY_FILE",
  cacheDir: "CACHE_DIR",
  routingFile: "ROUTING_FILE",
  pluginsDir: "PLUGINS_DIR",
  enabledPlugins: "ENABLED_PLUGINS",
  uiLocaleFile: "UI_LOCALE_FILE",
  ollamaHost: "OLLAMA_HOST",
  ollamaModel: "OLLAMA_MODEL",
  editorialProfile: "EDITORIAL_PROFILE",
  feedConcurrency: "FEED_CONCURRENCY",
  domainConcurrency: "DOMAIN_CONCURRENCY",
  imageConcurrency: "IMAGE_CONCURRENCY",
  maxCandidates: "MAX_CANDIDATES",
  maxItemsPerFeed: "MAX_ITEMS_PER_FEED",
  aiBatchSize: "AI_BATCH_SIZE",
  itemsPerCategory: "ITEMS_PER_CATEGORY",
  llmMinScore: "LLM_MIN_SCORE",
  requireImages: "REQUIRE_IMAGES",
  cacheImages: "CACHE_IMAGES",
  exportPdf: "EXPORT_PDF",
  exportEmail: "EXPORT_EMAIL",
  exportSocial: "EXPORT_SOCIAL",
  exportMarkdown: "EXPORT_MARKDOWN",
  autoOpen: "AUTO_OPEN",
  historyEnabled: "HISTORY_ENABLED",
  analysisCacheDays: "ANALYSIS_CACHE_DAYS",
};
const fileFields = new Set([
  "presetDir",
  "categoriesFile",
  "feedsFile",
  "dataDir",
  "outputDir",
  "memoryFile",
  "cacheDir",
  "routingFile",
  "pluginsDir",
  "uiLocaleFile",
]);
export async function profileEnvironment(file, baseEnv = process.env) {
  const absolute = path.resolve(file);
  const base = path.dirname(absolute);
  const document = parseYaml(await fs.readFile(absolute, "utf8"));
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw new Error("Profile must be a YAML/JSON object.");
  const environment = { ...baseEnv };
  for (const field of Object.values(fields)) delete environment[field];
  environment.HIGHLORDS_PROFILE = "true";
  environment.PRESET = document.preset || "global";
  for (const [key, value] of Object.entries(document)) {
    if (key === "secretsFile") {
      const secrets = parseEnv(
        await fs.readFile(path.resolve(base, String(value)), "utf8"),
      );
      for (const [secret, content] of Object.entries(secrets))
        if (/^(SMTP_|EMAIL_|TELEGRAM_|DISCORD_)/.test(secret))
          environment[secret] = content;
      continue;
    }
    if (!fields[key]) throw new Error(`Unknown profile option: ${key}`);
    if (
      !["string", "number", "boolean"].includes(typeof value) &&
      !Array.isArray(value)
    )
      throw new Error(`Invalid profile option: ${key}`);
    environment[fields[key]] = fileFields.has(key)
      ? path.resolve(base, String(value))
      : Array.isArray(value)
        ? value.join(",")
        : String(value);
  }
  if (!document.dataDir || !document.outputDir)
    throw new Error("Each profile must define isolated dataDir and outputDir.");
  environment.MEMORY_FILE ||= path.join(
    environment.DATA_DIR,
    "highlords.sqlite",
  );
  // A inherited .env must not accidentally mix two publication histories.
  if (!document.memoryFile)
    environment.MEMORY_FILE = path.join(
      environment.DATA_DIR,
      "highlords.sqlite",
    );
  if (!document.cacheDir)
    environment.CACHE_DIR = path.join(environment.DATA_DIR, "cache");
  return environment;
}
export function takeProfile(args) {
  const index = args.indexOf("--config");
  if (index < 0) return { file: null, args };
  const file = args[index + 1];
  if (!file || file.startsWith("--"))
    throw new Error("--config needs a profile file.");
  return { file, args: args.filter((_, i) => i !== index && i !== index + 1) };
}
