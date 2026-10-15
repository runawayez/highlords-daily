import { initArchive } from "../ui/archive-client.mjs";
import { editionStories, articleKey } from "../editorial/audit.mjs";
import { safeUrl } from "../utils/html.mjs";
import { readJson, atomicWrite } from "../utils/storage.mjs";
import { uiCatalog, direction } from "./i18n.mjs";
import { escapeHtml } from "../utils/html.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { config, publication } from "../config.mjs";

function labels() {
  const ui = uiCatalog();
  return {
    title: ui.archiveTitle,
    latest: ui.latest,
    stories: ui.storyPlural,
    open: ui.readArticle,
    sources: ui.sourcePlural,
  };
}

export async function updateArchive(outputDir = config.outputDir) {
  if (!config.archiveEnabled) return null;
  await fs.mkdir(outputDir, { recursive: true });
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const editions = [];
  const stories = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name))
      continue;
    try {
      const json = JSON.parse(
        await fs.readFile(
          path.join(outputDir, entry.name, "edition.json"),
          "utf8",
        ),
      );
      for (const story of editionStories(json)) {
        const section = (json.sections || []).find(
          (section) => section.slug === story.category,
        );
        stories.push({
          key: articleKey(story),
          date: entry.name,
          headline: String(story.headline || story.originalTitle || ""),
          originalTitle: String(story.originalTitle || ""),
          excerpt: String(story.excerpt || ""),
          summary: String(story.summary || ""),
          source: String(story.source || ""),
          language: story.language || "und",
          category: String(story.category || ""),
          categoryName: String(section?.name || story.category || ""),
          tags: Array.isArray(story.tags) ? story.tags.map(String) : [],
          link: safeUrl(story.link),
        });
      }
      editions.push({
        date: entry.name,
        title: String(json.title || entry.name),
        intro: String(json.intro || ""),
        stories: Number(json.stats?.stories || 0),
        sources: Number(json.stats?.sources || 0),
      });
    } catch {}
  }

  editions.sort((a, b) => b.date.localeCompare(a.date));
  stories.sort((a, b) => b.date.localeCompare(a.date));
  const ui = { ...uiCatalog(), ...labels() };
  const status = await readJson(path.join(outputDir, "status.json"));
  const notice =
    status && status.status !== "completed"
      ? `<p class="notice" role="status">${escapeHtml(status.status === "pdf-pending" ? ui.pdfPending : ui.generationFailed)} (${escapeHtml(status.editionDate)}) ${escapeHtml(status.error || "")}</p>`
      : "";
  const categoryOptions = [
    ...new Map(
      stories.map((story) => [story.category, story.categoryName]),
    ).entries(),
  ]
    .sort()
    .map(
      ([slug, name]) =>
        `<option value="${escapeHtml(slug)}">${escapeHtml(name)}</option>`,
    )
    .join("");
  const sourceOptions = [...new Set(stories.map((story) => story.source))]
    .sort()
    .map((name) => `<option>${escapeHtml(name)}</option>`)
    .join("");
  const storyCards = stories
    .map(
      (story, index) =>
        `<article class="edition archive-story" data-index="${index}"><div class="date">${escapeHtml(story.date)} · ${escapeHtml(story.categoryName)}</div><h2><a href="${escapeHtml(story.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(story.headline)}</a></h2><p>${escapeHtml(story.summary)}</p><div class="meta">${escapeHtml(story.source)} · <a href="./${story.date}/index.html">${escapeHtml(ui.open)}</a></div><label>${escapeHtml(ui.feedback)} <select class="feedback-choice"><option value="">—</option><option value="relevant">${escapeHtml(ui.relevant)}</option><option value="repeated">${escapeHtml(ui.repeated)}</option><option value="wrong-category">${escapeHtml(ui.wrongCategory)}</option></select></label><label class="correction"><select class="feedback-category" aria-label="${escapeHtml(ui.correctCategory)}"><option value="">${escapeHtml(ui.correctCategory)}</option>${categoryOptions}</select></label></article>`,
    )
    .join("");
  const archiveData = JSON.stringify({
    publication: publication.slug,
    stories,
    ui,
  }).replaceAll("<", String.fromCharCode(92) + "u003c");
  const cards = editions
    .map(
      (edition) => `
    <article class="edition">
      <div class="date">${escapeHtml(edition.date)}</div>
      <h2>${escapeHtml(edition.title)}</h2>
      <p>${escapeHtml(edition.intro)}</p>
      <div class="meta">${edition.stories} ${escapeHtml(ui.stories)} · ${edition.sources} ${escapeHtml(ui.sources)}</div>
      <a href="./${escapeHtml(edition.date)}/index.html">${escapeHtml(ui.open)} ↗</a>
    </article>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="${escapeHtml(config.language)}" dir="${direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(publication.name)} — ${escapeHtml(ui.title)}</title>
<style>
:root{--accent:${publication.accentColor};--paper:${publication.paperColor};--bg:${publication.backgroundColor};--ink:#171717;--muted:#6d675f}*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Inter,Arial,sans-serif;color:var(--ink)}main{width:min(calc(100% - 32px),980px);margin:32px auto;background:var(--paper);padding:38px;min-height:70vh}.top{display:flex;justify-content:space-between;gap:20px;align-items:end;border-bottom:4px solid var(--ink);padding-bottom:20px;margin-bottom:24px}h1{margin:0;font-family:Georgia,serif;font-size:42px}.tag{color:var(--accent);font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.latest{color:var(--accent);font-weight:800;text-decoration:none}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.edition{background:rgba(255,255,255,.4);border:1px solid #d8d0c2;padding:20px}.edition .date{font-size:10px;font-weight:900;color:var(--accent);letter-spacing:.08em}.edition h2{font-family:Georgia,serif;font-size:24px;margin:8px 0}.edition p{font-size:13px;line-height:1.5;color:var(--muted)}.edition .meta{font-size:10px;color:var(--muted);margin:14px 0}.edition a{color:var(--accent);font-size:11px;font-weight:900;text-decoration:none}@media(max-width:700px){main{width:100%;margin:0;padding:24px}.grid{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}h1{font-size:34px}}
[hidden]{display:none!important}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}input,select,button{font:inherit;max-width:100%;padding:9px;border:1px solid #c9c0b0;background:#fff;color:var(--ink)}input{flex:1;min-width:180px}.notice{padding:14px;border-inline-start:4px solid var(--accent);background:#fff3dc}#feedback-status,#result-count{font-size:12px}.archive-story h2 a{font:inherit}.archive-story select{font-size:12px;margin-top:8px}</style>
</head>
<body><main><div class="top"><div><div class="tag">${escapeHtml(publication.name)}</div><h1>${escapeHtml(ui.title)}</h1></div>${editions.length ? `<a class="latest" href="./${escapeHtml(editions[0].date)}/index.html">${escapeHtml(ui.latest)} ↗</a>` : ""}</div>${notice}<div class="controls"><input id="search" type="search" aria-label="${escapeHtml(ui.searchArchive)}" placeholder="${escapeHtml(ui.searchArchive)}"><select id="category" aria-label="${escapeHtml(ui.allCategories)}"><option value="">${escapeHtml(ui.allCategories)}</option>${categoryOptions}</select><select id="source" aria-label="${escapeHtml(ui.allSources)}"><option value="">${escapeHtml(ui.allSources)}</option>${sourceOptions}</select></div><p id="result-count" role="status"></p><div id="editions" class="grid">${cards || "<p>No editions yet.</p>"}</div><div id="stories" class="grid" hidden>${storyCards}</div><p><button id="export-feedback">${escapeHtml(ui.exportFeedback)}</button></p><p id="feedback-status" role="status"></p><script id="archive-data" type="application/json">${archiveData}</script><script>(${initArchive.toString()})();</script></main></body></html>`;

  const target = path.join(outputDir, "index.html");
  await atomicWrite(target, html);
  return target;
}
