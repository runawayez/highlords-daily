import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { config } from "../config.mjs";
import { bundledSources, selectSources } from "../sources/catalog.mjs";
import { researchSites } from "../sources/research.mjs";
import { discover } from "./feeds-discover.mjs";
import { fetchFeedXml, recordFeedHealth } from "../services/feed-cache.mjs";
import { mapLimit } from "../utils/concurrency.mjs";
import { atomicWrite, readJson } from "../utils/storage.mjs";
import Parser from "rss-parser";
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const output = value(
  "--output",
  path.join(config.dataDir, "sources", "feeds.yml"),
);
const region = value("--region", config.region);
const languages = value("--languages", config.sourceLanguages.join(","))
  .split(",")
  .filter(Boolean);
let catalog = bundledSources();
if (args.includes("--catalog"))
  catalog.push(
    ...(parseYaml(await fs.readFile(value("--catalog"), "utf8")).feeds || []),
  );
let sources = selectSources(catalog, {
  region,
  languages,
  categories: value("--categories", "").split(",").filter(Boolean),
});
const sites = args
  .flatMap((arg, index) => (arg === "--site" ? [args[index + 1]] : []))
  .filter(Boolean);
let researched = [];
if (args.includes("--research")) {
  researched = await researchSites({
    region: value("--query", region),
    language: value("--research-language", "en"),
  });
  sites.push(...researched.map((item) => item.site));
}
const discovered = await mapLimit([...new Set(sites)], 3, (site) =>
  discover(site),
);
for (const result of discovered)
  for (const feed of result.feeds)
    sources.push({
      name: feed.title,
      url: feed.url,
      focus: [],
      coverage: [],
      requestedRegion: region,
      language: feed.language || null,
      publisher_group: new URL(result.siteUrl).hostname,
      catalogStatus: "discovered",
      discoveredFrom: result.siteUrl,
    });
const unique = [
  ...new Map(sources.map((source) => [source.url, source])).values(),
];
const parser = new Parser();
const checked = await mapLimit(
  unique,
  config.feedConcurrency,
  async (source) => {
    const start = performance.now();
    try {
      const parsed = await parser.parseString(await fetchFeedXml(source.url));
      const language = source.language || parsed.language || null;
      const matches =
        !languages.length ||
        !language ||
        languages.some((lang) => lang.split("-")[0] === language.split("-")[0]);
      const result = {
        ...source,
        language,
        lastValidatedAt: new Date().toISOString(),
        availableItems: parsed.items?.length || 0,
        status: "validated",
        images: "auto",
        enabled: matches,
      };
      await recordFeedHealth(source.url, {
        items: result.availableItems,
        elapsedMs: performance.now() - start,
      });
      return result;
    } catch (error) {
      await recordFeedHealth(source.url, {
        error: error.message,
        elapsedMs: performance.now() - start,
      });
      return { ...source, status: "unavailable", enabled: false };
    }
  },
);
await atomicWrite(
  output,
  stringifyYaml({ version: 1, preset: "custom", region, feeds: checked }),
);
await atomicWrite(
  `${output}.research.json`,
  JSON.stringify(
    { researched, discovered, checkedAt: new Date().toISOString() },
    null,
    2,
  ),
);
console.log(
  `${checked.filter((source) => source.enabled !== false).length} working feeds saved to ${output}. Review coverage, language and ownership before enabling them in FEEDS_FILE.`,
);
