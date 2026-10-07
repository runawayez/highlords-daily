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
  const ui = labels();
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
</style>
</head>
<body><main><div class="top"><div><div class="tag">${escapeHtml(publication.name)}</div><h1>${escapeHtml(ui.title)}</h1></div>${editions.length ? `<a class="latest" href="./${escapeHtml(editions[0].date)}/index.html">${escapeHtml(ui.latest)} ↗</a>` : ""}</div><div class="grid">${cards || "<p>No editions yet.</p>"}</div></main></body></html>`;

  const target = path.join(outputDir, "index.html");
  await fs.writeFile(target, html, "utf8");
  return target;
}
