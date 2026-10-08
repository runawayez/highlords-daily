import { uiCatalog, direction } from "../services/i18n.mjs";
import { escapeHtml, safeUrl } from "../utils/html.mjs";
import { config, publication } from "../config.mjs";

function card(article) {
  if (!article) return "";
  const image = safeUrl(article.originalImageUrl || article.imageUrl, "");
  return `<article style="border-top:1px solid #ddd;padding:18px 0">${image ? `<img src="${escapeHtml(image)}" alt="" style="display:block;width:100%;max-height:360px;object-fit:cover;margin:0 0 14px">` : ""}<div style="font-size:11px;color:${publication.accentColor};font-weight:700">${escapeHtml(article.source)}</div><h3 style="font-family:Georgia,serif;font-size:22px;line-height:1.15;margin:6px 0 9px"><a href="${escapeHtml(safeUrl(article.link))}" style="color:#171717;text-decoration:none">${escapeHtml(article.headline || article.originalTitle)}</a></h3><p style="color:#666;font-size:14px;line-height:1.5;margin:0">${escapeHtml(article.summary || article.excerpt || "")}</p></article>`;
}

function compactCard(article, index) {
  if (!article) return "";
  return `<article style="display:grid;grid-template-columns:28px 1fr;gap:10px;border-top:1px solid #ddd;padding:14px 0"><div style="color:${publication.accentColor};font-size:11px;font-weight:800">${String(index + 1).padStart(2, "0")}</div><div><div style="font-size:10px;color:${publication.accentColor};font-weight:700">${escapeHtml(article.source)}</div><h3 style="font-family:Georgia,serif;font-size:19px;line-height:1.15;margin:5px 0 7px"><a href="${escapeHtml(safeUrl(article.link))}" style="color:#171717;text-decoration:none">${escapeHtml(article.headline || article.originalTitle)}</a></h3><p style="color:#666;font-size:13px;line-height:1.45;margin:0">${escapeHtml(article.summary || article.excerpt || "")}</p></div></article>`;
}

export function renderEmailHtml(edition) {
  const ui = uiCatalog();
  const topStories = edition.topStories?.length
    ? `<h2 style="font-family:Georgia,serif;font-size:25px;border-top:3px solid ${publication.accentColor};padding-top:12px">${escapeHtml(edition.frontPageTitle || ui.fallbackTitle)}</h2>${edition.topStories.map(compactCard).join("")}`
    : "";
  const sections = (edition.sections || [])
    .filter((section) => section.articles?.length)
    .map(
      (section) =>
        `<h2 style="font-family:Georgia,serif;font-size:25px;border-top:3px solid #171717;padding-top:12px">${escapeHtml(section.name)}</h2>${section.articles.map(card).join("")}`,
    )
    .join("");
  return `<!doctype html><html lang="${escapeHtml(config.language)}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#eee"><div style="max-width:720px;margin:0 auto;background:${publication.paperColor};padding:32px"><div style="font-size:12px;color:${publication.accentColor};font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(publication.name)}</div><h1 style="font-family:Georgia,serif;font-size:38px;line-height:1.05;margin:10px 0">${escapeHtml(edition.title)}</h1><p style="font-size:17px;line-height:1.55;color:#666">${escapeHtml(edition.intro)}</p><h2 style="font-size:12px;color:${publication.accentColor};letter-spacing:.12em;text-transform:uppercase;margin-top:28px">${escapeHtml(ui.leadLabel)}</h2>${card(edition.lead)}${topStories}${sections}<footer style="border-top:1px solid #ccc;margin-top:28px;padding-top:16px;color:#777;font-size:11px">${escapeHtml(publication.name)} · ${escapeHtml(edition.editionDate)}</footer></div></body></html>`;
}
