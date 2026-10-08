import { uiCatalog, direction } from "./services/i18n.mjs";
import { escapeHtml, safeUrl } from "./utils/html.mjs";
import { categories, config, publication } from "./config.mjs";

const defaultCategoryLabels = new Map(
  categories.map((category) => [category.slug, category.name]),
);

function safeMediaUrl(value = "") {
  const raw = String(value || "").trim();
  if (/^(?:assets\/|\.\/assets\/)/i.test(raw)) return raw.replace(/^\.\//, "");
  if (/^data:image\//i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function hasStoryImage(article) {
  return Boolean(safeMediaUrl(article?.imageUrl));
}

function defaultUi() {
  return {
    ...uiCatalog(),
    ...(publication.tagline ? { brandTagline: publication.tagline } : {}),
  };
}
function editionUi() {
  return defaultUi();
}

function categoryMap(edition) {
  const map = new Map(defaultCategoryLabels);
  for (const section of edition?.sections || []) {
    if (section?.slug && section?.name) map.set(section.slug, section.name);
  }
  return map;
}

function countLabel(value, singular, plural) {
  const number = Number(value || 0);
  return `${number} ${number === 1 ? singular : plural}`;
}

function formatDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(config.language, {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function initials() {
  return (
    publication.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "HD"
  );
}

function storyCard(
  article,
  { lead = false, ui = defaultUi(), labels = defaultCategoryLabels } = {},
) {
  if (!article) return "";
  const imageSrc = safeMediaUrl(article.imageUrl);
  const hasImage = Boolean(imageSrc);
  const image = hasImage
    ? `<a class="story-image" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(imageSrc)}" alt="" loading="eager" onerror="const c=this.closest('.story-card');this.parentElement.remove();if(c)c.classList.add('no-image','text-card')"></a>`
    : "";
  const tags =
    Array.isArray(article.tags) && article.tags.length
      ? `<div class="tags">${article.tags
          .slice(0, 5)
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";
  const category =
    labels.get(article.category) ||
    String(article.category || "").replace(/-/g, " ");
  const classes = [
    "story-card",
    lead ? "lead-card" : "",
    hasImage ? "has-image" : "no-image text-card",
  ]
    .filter(Boolean)
    .join(" ");

  return `<article class="${classes}">
    ${image}
    <div class="story-body">
      <div class="story-meta"><span class="source">${escapeHtml(article.source)}</span><span>${escapeHtml(category)}</span><b>${Number(article.score || 0).toFixed(1)}</b></div>
      <h${lead ? "2" : "3"}><a href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.headline || article.originalTitle)}</a></h${lead ? "2" : "3"}>
      <p>${escapeHtml(article.summary || article.excerpt || "")}</p>
      ${tags}
      <a class="read-link" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(ui.readArticle)} ↗</a>
    </div>
  </article>`;
}

function sectionMarkup(section, index, ui, labels) {
  const rows = [];
  for (let offset = 0; offset < section.articles.length; offset += 2) {
    const articles = section.articles.slice(offset, offset + 2);
    const imageCount = articles.filter(hasStoryImage).length;
    const composition =
      imageCount === 0
        ? "text-row"
        : imageCount === articles.length
          ? "image-row"
          : "mixed-row";
    const gridClass = [
      "section-grid",
      articles.length === 1 ? "single" : "",
      composition,
    ]
      .filter(Boolean)
      .join(" ");
    rows.push(
      `<div class="${gridClass}">${articles.map((article) => storyCard(article, { ui, labels })).join("")}</div>`,
    );
  }
  const highlightLabel =
    section.articles.length === 1 ? ui.highlightSingular : ui.highlightPlural;
  return `<section class="newsletter-section" id="${escapeHtml(section.slug)}">
    <div class="section-start"><div class="section-title"><span class="section-number">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(section.name)}</h2><span class="section-count">${section.articles.length} ${escapeHtml(highlightLabel)}</span></div>
    ${rows[0] || ""}</div>${rows.slice(1).join("")}
  </section>`;
}

export function renderNewsletterHtml(edition, logoDataUri = "") {
  const visibleSections = edition.sections.filter(
    (section) => Array.isArray(section.articles) && section.articles.length > 0,
  );
  const ui = editionUi(edition);
  const labels = categoryMap(edition);
  const nav = visibleSections
    .map(
      (section) =>
        `<a href="#${escapeHtml(section.slug)}">${escapeHtml(section.name)}</a>`,
    )
    .join("");
  const logo = logoDataUri
    ? `<img class="logo" src="${logoDataUri}" alt="${escapeHtml(publication.name)}">`
    : `<div class="logo-fallback">${escapeHtml(initials())}</div>`;
  const sections = visibleSections
    .map((section, index) => sectionMarkup(section, index, ui, labels))
    .join("");
  const profileStat = edition.profile
    ? `<span class="stat">${escapeHtml(edition.profile)}</span>`
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(config.language)}" dir="${direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(publication.name)} — ${escapeHtml(edition.editionDate)}</title>
<style>
.story-body{text-align:start}.story-meta{flex-wrap:wrap}html[dir=rtl] .tags{direction:rtl}

:root{--bg:${publication.backgroundColor};--paper:${publication.paperColor};--ink:#171717;--muted:#69655d;--red:${publication.accentColor};--line:#d8d0c2;--soft:#ece5d8;--white:#fff;--max:1060px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,"Noto Sans","Noto Sans CJK JP","Noto Sans Arabic",Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}.shell{width:min(calc(100% - 34px),var(--max));margin:34px auto 70px;background:var(--paper);box-shadow:0 28px 90px rgba(0,0,0,.45);overflow:hidden}.masthead{background:var(--ink);color:var(--white);padding:22px 38px 20px;border-top:8px solid var(--red)}.masthead-row{display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:flex;align-items:center;gap:14px}.logo,.logo-fallback{width:48px;height:48px;display:block;object-fit:contain}.logo-fallback{display:grid;place-items:center;border:1px solid #555;font-weight:900}.brand-name{font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:700;letter-spacing:-.02em}.brand-tag{margin-top:4px;color:var(--red);font-size:10px;font-weight:800;letter-spacing:.19em}.edition-date{font-size:11px;line-height:1.4;text-align:end;color:#c9c6c0;text-transform:uppercase;letter-spacing:.1em}.hero{padding:38px 38px 26px}.hero-intro{max-width:810px;margin:0;color:var(--muted);font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.55}.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.stat{padding:7px 10px;border:1px solid var(--line);border-radius:999px;font-size:10px;font-weight:700;color:#5d5952;background:rgba(255,255,255,.25)}.index{display:flex;gap:7px;overflow:auto;padding:0 38px 26px}.index a{flex:0 0 auto;color:var(--ink);text-decoration:none;border-bottom:1px solid transparent;padding:5px 0;margin-inline-end:12px;font-size:11px;font-weight:800}.index a:hover{color:var(--red);border-color:var(--red)}.lead-wrap{padding:0 38px 36px}.lead-label{margin-bottom:12px;font-size:10px;color:var(--red);font-weight:900;letter-spacing:.16em}.story-card{background:rgba(255,255,255,.42);border:1px solid var(--line);border-radius:3px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.story-image{display:block;width:100%;aspect-ratio:16/9;background:#ded7ca;overflow:hidden}.story-image img{width:100%;height:100%;object-fit:cover;display:block}.story-body{padding:17px 18px 18px}.story-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#7a756c;font-size:9px;text-transform:uppercase;letter-spacing:.07em;font-weight:700}.story-meta .source{color:var(--red)}.story-meta b{margin-inline-start:auto;color:var(--ink);font-size:10px}.story-card h2,.story-card h3{font-family:Georgia,'Times New Roman',serif;margin:9px 0 10px;letter-spacing:-.02em}.story-card h2{font-size:31px;line-height:1.02}.story-card h3{font-size:21px;line-height:1.08}.story-card h2 a,.story-card h3 a{color:var(--ink);text-decoration:none}.story-card p{margin:0;color:var(--muted);font-size:12.5px;line-height:1.55}.tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.tags span{padding:4px 7px;background:var(--soft);font-size:9px;font-weight:800;color:#5e5951;border-radius:2px}.read-link{display:inline-block;margin-top:13px;color:var(--red);font-size:10px;font-weight:900;text-decoration:none}.text-card{position:relative;background:transparent;border:0;border-top:4px solid var(--ink);border-bottom:1px solid var(--line);border-radius:0}.text-card:before{content:"";position:absolute;top:12px;inset-inline-end:18px;width:22px;height:3px;background:var(--red)}.text-card .story-body{padding:22px 20px 20px}.text-card h3{font-size:26px;line-height:1.03;max-width:92%;margin-top:13px}.text-card p{font-family:Georgia,'Times New Roman',serif;font-size:13.5px;line-height:1.6;max-width:95%}.text-card .tags span{background:transparent;border:1px solid var(--line)}.lead-card{display:grid;grid-template-columns:minmax(0,1.17fr) minmax(300px,.83fr);background:var(--ink);border:0;color:white}.lead-card .story-image{height:100%;aspect-ratio:auto;min-height:330px}.lead-card .story-body{padding:28px 28px 26px}.lead-card .story-meta{color:#aaa}.lead-card .story-meta .source{color:var(--red)}.lead-card .story-meta b{color:#fff}.lead-card h2 a{color:#fff}.lead-card p{color:#c8c5bf;font-size:13.5px}.lead-card .tags span{background:#2a2a2e;color:#d6d3cd}.lead-card .read-link{color:var(--red)}.lead-card.no-image{display:block;background:var(--ink);border:0;border-top:7px solid var(--red);padding:8px 0}.lead-card.no-image:before{display:none}.lead-card.no-image .story-body{padding:34px 38px 36px;max-width:900px}.lead-card.no-image h2{font-size:43px;line-height:.98;max-width:820px;margin:15px 0 18px}.lead-card.no-image p{max-width:720px;color:#d0cdc7;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6}.newsletter-section{padding:0 38px 38px;break-inside:auto}.section-title{display:grid;grid-template-columns:42px 1fr auto;align-items:end;gap:10px;border-top:4px solid var(--ink);padding:15px 0 13px}.section-title h2{margin:0;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:1}.section-number{color:var(--red);font-size:10px;font-weight:900;letter-spacing:.12em}.section-count{font-size:9px;font-weight:800;color:#817b72;text-transform:uppercase;letter-spacing:.08em}.section-start{break-inside:avoid;page-break-inside:avoid}.section-grid+.section-grid,.section-start+.section-grid{margin-top:14px}.section-grid{break-inside:avoid;page-break-inside:avoid;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.section-grid.single{grid-template-columns:1fr}.section-grid.single .story-card.has-image{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}.section-grid.single .story-card.has-image .story-image{height:100%;aspect-ratio:auto;min-height:250px}.section-grid.single.text-row .text-card h3{font-size:31px;max-width:780px}.section-grid.single.text-row .text-card p{max-width:760px}.section-grid.mixed-row{grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);align-items:stretch}.section-grid.mixed-row .text-card{align-self:stretch}.section-grid.text-row{gap:24px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:18px 0}.section-grid.text-row .text-card{border-bottom:0}.section-grid.text-row .text-card:first-child{border-inline-end:1px solid var(--line);padding-inline-end:10px}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:8px;padding:24px 38px 28px;background:#e8e0d2;color:#6d675f;font-size:10px}.footer strong{color:var(--ink)}
@media(max-width:760px){.shell{width:100%;margin:0;box-shadow:none}.masthead,.hero,.lead-wrap,.newsletter-section,.footer{padding-left:20px;padding-right:20px}.index{padding-left:20px;padding-right:20px}.masthead-row{align-items:flex-start}.brand-name{font-size:23px}.edition-date{font-size:9px}.hero-intro{font-size:17px}.lead-card,.section-grid.single .story-card.has-image{grid-template-columns:1fr}.lead-card .story-image,.section-grid.single .story-card.has-image .story-image{min-height:220px;aspect-ratio:16/9}.lead-card.no-image h2{font-size:34px}.lead-card.no-image .story-body{padding:28px 24px 30px}.section-grid,.section-grid.mixed-row,.section-grid.text-row{grid-template-columns:1fr}.section-grid.text-row{gap:14px}.section-grid.text-row .text-card:first-child{border-inline-end:0;padding-inline-end:0}.text-card h3{font-size:24px}}
@page{size:A4;margin:9mm}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{background:#fff}.shell{width:100%;margin:0;box-shadow:none;overflow:visible}.masthead{padding:16px 22px 15px;border-top-width:5px}.logo,.logo-fallback{width:38px;height:38px}.brand-name{font-size:23px}.brand-tag{font-size:8px}.edition-date{font-size:8px}.hero{padding:22px 22px 16px}.hero-intro{font-size:13px;margin-top:12px;max-width:650px}.stats{margin-top:13px}.stat{font-size:8px;padding:5px 7px}.index{display:none}.lead-wrap{padding:0 22px 22px}.lead-label{font-size:8px;margin-bottom:8px}.lead-card{grid-template-columns:1.05fr .95fr}.lead-card .story-image{min-height:250px}.lead-card .story-body{padding:18px}.lead-card.no-image{display:block;padding:4px 0;border-top-width:5px}.lead-card.no-image .story-body{padding:22px 24px 24px}.lead-card.no-image h2{font-size:31px;line-height:1}.lead-card.no-image p{font-size:11px;max-width:620px}.story-card h2{font-size:23px}.story-card h3{font-size:16px}.story-card p{font-size:9.5px;line-height:1.45}.story-body{padding:12px}.story-meta{font-size:7.5px}.story-meta b{font-size:8px}.tags{margin-top:8px}.tags span{font-size:7px;padding:3px 5px}.read-link{font-size:8px;margin-top:9px}.text-card{border-top-width:3px}.text-card:before{top:8px;inset-inline-end:12px;width:16px;height:2px}.text-card .story-body{padding:14px 13px}.text-card h3{font-size:19px;line-height:1.04;margin-top:10px}.text-card p{font-size:9.8px;line-height:1.48}.newsletter-section{padding:0 22px 22px}.section-title{padding:11px 0 9px;border-top-width:3px}.section-title h2{font-size:22px}.section-count,.section-number{font-size:7.5px}.section-grid{gap:9px}.section-grid.mixed-row{grid-template-columns:1.08fr .92fr}.section-grid.text-row{gap:14px;padding:11px 0}.section-grid.single .story-card.has-image{grid-template-columns:.9fr 1.1fr}.section-grid.single .story-card.has-image .story-image{min-height:190px}.section-grid.single.text-row .text-card h3{font-size:22px}.footer{padding:16px 22px 18px;font-size:8px}.story-card{break-inside:avoid;page-break-inside:avoid}.section-title{break-after:avoid;page-break-after:avoid}}
</style>
</head>
<body>
<main class="shell">
  <header class="masthead"><div class="masthead-row"><div class="brand">${logo}<div><div class="brand-name">${escapeHtml(publication.name)}</div><div class="brand-tag">${escapeHtml(ui.brandTagline)}</div></div></div><div class="edition-date">${escapeHtml(formatDate(edition.editionDate))}</div></div></header>
  <section class="hero"><p class="hero-intro">${escapeHtml(edition.intro)}</p><div class="stats"><span class="stat">${escapeHtml(countLabel(edition.stats.stories, ui.storySingular, ui.storyPlural))}</span><span class="stat">${escapeHtml(countLabel(edition.stats.sources, ui.sourceSingular, ui.sourcePlural))}</span><span class="stat">${escapeHtml(countLabel(edition.stats.candidates, ui.candidateSingular, ui.candidatePlural))}</span><span class="stat">${escapeHtml(ui.localAiCuration)}</span>${profileStat}</div></section>
  ${nav ? `<nav class="index">${nav}</nav>` : ""}
  <section class="lead-wrap"><div class="lead-label">${escapeHtml(ui.leadLabel)}</div>${storyCard(edition.lead, { lead: true, ui, labels })}</section>
  ${sections}
  <footer class="footer"><span><strong>${escapeHtml(publication.name)}</strong> · ${escapeHtml(ui.localAiCuration)}</span><span>${escapeHtml(edition.editionDate)}</span></footer>
</main>
</body>
</html>`;
}
