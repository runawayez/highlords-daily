import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
const regional = JSON.parse(
  await fs.readFile(
    new URL("./regional-catalog.json", import.meta.url),
    "utf8",
  ),
);
const documents = await Promise.all(
  ["br", "global"].map(async (preset) =>
    parseYaml(
      await fs.readFile(
        new URL(`../../presets/${preset}/feeds.yml`, import.meta.url),
        "utf8",
      ),
    ),
  ),
);
export function bundledSources() {
  const sources = new Map();
  documents.forEach((document, index) => {
    for (const feed of document.feeds || [])
      if (!sources.has(feed.url))
        sources.set(feed.url, {
          ...feed,
          country: feed.country || (index === 0 ? "BR" : null),
          language: feed.language || (index === 0 ? "pt-BR" : null),
          coverage: feed.coverage || (index === 0 ? ["BR"] : ["GLOBAL"]),
          publisher_group:
            feed.publisher_group || feed.name.split("·")[0].trim(),
          catalogStatus: "bundled",
        });
  });
  return [
    ...sources.values(),
    ...regional.map((source) => ({
      ...source,
      catalogStatus: "seed-unvalidated",
    })),
  ];
}
export function selectSources(
  catalog,
  { region, languages = [], categories = [] },
) {
  return catalog.filter(
    (source) =>
      (!region ||
        region === "GLOBAL" ||
        source.country === region ||
        (source.coverage || []).includes(region)) &&
      (!languages.length ||
        !source.language ||
        languages.some(
          (lang) => lang.split("-")[0] === source.language.split("-")[0],
        )) &&
      (!categories.length ||
        !source.focus?.length ||
        source.focus.some((category) => categories.includes(category))),
  );
}
