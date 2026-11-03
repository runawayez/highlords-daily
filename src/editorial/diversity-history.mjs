import path from "node:path";
import { readJson, atomicWrite } from "../utils/storage.mjs";
import { editionStories } from "./audit.mjs";
import { editorialFamily, isFootball } from "./balance.mjs";

export async function recordDiversity(edition, directory) {
  const file = path.join(directory, "diversity-history.json");
  const history = await readJson(file, []);
  const stories = editionStories(edition);
  const families = {};
  for (const article of stories) {
    const family = editorialFamily(article);
    families[family] = (families[family] || 0) + 1;
  }
  const entry = {
    date: edition.editionDate,
    stories: stories.length,
    families,
    sources: new Set(
      stories.map((article) => article.publisherGroup || article.source),
    ).size,
    football: stories.filter(isFootball).length,
    local: stories.filter((article) => article.geographicScope === "local")
      .length,
    readingMinutes: edition.stats?.readingMinutes || null,
    missing: edition.stats?.coverage?.missing || [],
  };
  const recent = [...history.filter((item) => item.date !== entry.date), entry]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  await atomicWrite(file, JSON.stringify(recent, null, 2));
  return recent;
}
