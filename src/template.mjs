import { uiCatalog, direction } from "./services/i18n.mjs";
import { escapeHtml, safeUrl } from "./utils/html.mjs";
import { categories, config, publication } from "./config.mjs";

const defaultCategoryLabels = new Map(
  categories.map((category) => [category.slug, category.name]),
);

const layoutNames = new Set([
  "solo-visual",
  "solo-text",
  "feature-grid",
  "balanced-grid",
  "text-grid",
  "mixed-grid",
  "briefs-grid",
]);

function safeMediaUrl(value = "") {
  const raw = String(value || "").trim();
  if (/^(?:assets\/|\.\/assets\/)/i.test(raw))
    return raw.replace(/^\.\//, "");
  if (/^data:image\//i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return ["http:", "https:", "file:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function storyRole(article) {
  return ["feature", "standard", "brief"].includes(article?.displayRole)
    ? article.displayRole
    : "standard";
}

function hasStoryImage(article, role = storyRole(article)) {
  if (article?.displayImage === false || role === "brief") return false;
  return Boolean(safeMediaUrl(article?.imageUrl));
}

function defaultUi() {
  return {
    ...uiCatalog(),
    ...(publication.tagline ? { brandTagline: publication.tagline } : {}),
  };
}

function editionUi(edition) {
  return { ...defaultUi(), ...(edition?.ui || {}) };
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

function imageErrorHandler() {
  return "const c=this.closest('.story-card');const a=this.closest('.story-image');if(a)a.remove();if(c){c.classList.remove('has-image');c.classList.add('no-image','text-card')}const g=c?.closest('.section-grid');if(g){const cards=[...g.children];const n=cards.filter(x=>x.querySelector('.story-image')).length;if(n===0)g.classList.add('runtime-text')}";
}

function storyCard(
  article,
  {
    lead = false,
    role = storyRole(article),
    ui = defaultUi(),
    labels = defaultCategoryLabels,
  } = {},
) {
  if (!article) return "";
  const imageSrc = hasStoryImage(article, role)
    ? safeMediaUrl(article.imageUrl)
    : "";
  const image = imageSrc
    ? `<a class="story-image" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(imageSrc)}" alt="" loading="eager" onerror="${imageErrorHandler()}"></a>`
    : "";
  const tags =
    Array.isArray(article.tags) && article.tags.length && role !== "brief"
      ? `<div class="tags">${article.tags
          .slice(0, 3)
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";
  const category =
    labels.get(article.category) ||
    String(article.category || "").replace(/-/g, " ");
  const classes = [
    "story-card",
    lead ? "lead-card" : "",
    `role-${role}`,
    imageSrc ? "has-image" : "no-image text-card",
  ]
    .filter(Boolean)
    .join(" ");

  return `<article class="${classes}">
    ${image}
    <div class="story-body">
      <div class="story-meta"><span class="source">${escapeHtml(article.source)}</span><span>${escapeHtml(category)}</span></div>
      <h${lead ? "2" : "3"}><a href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.headline || article.originalTitle)}</a></h${lead ? "2" : "3"}>
      <p>${escapeHtml(article.summary || article.excerpt || "")}</p>
      ${tags}
      <a class="read-link" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(ui.readArticle)} ↗</a>
    </div>
  </article>`;
}

function frontStory(article, index, labels) {
  if (!article) return "";
  const category =
    labels.get(article.category) ||
    String(article.category || "").replace(/-/g, " ");
  return `<article class="front-story">
    <span class="front-rank">${String(index + 1).padStart(2, "0")}</span>
    <div><div class="front-meta"><span>${escapeHtml(article.source)}</span><span>${escapeHtml(category)}</span></div>
    <h3><a href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.headline || article.originalTitle)}</a></h3>
    <p>${escapeHtml(article.summary || article.excerpt || "")}</p></div>
  </article>`;
}

function frontPageMarkup(edition, ui, labels) {
  const stories = Array.isArray(edition?.topStories)
    ? edition.topStories.filter(Boolean)
    : [];
  if (!stories.length) return "";
  const rows = [];
  for (let offset = 0; offset < stories.length; offset += 2) {
    rows.push(
      `<div class="front-page-row">${stories
        .slice(offset, offset + 2)
        .map((article, index) => frontStory(article, offset + index, labels))
        .join("")}</div>`,
    );
  }
  const highlightLabel =
    stories.length === 1 ? ui.highlightSingular : ui.highlightPlural;
  return `<section class="front-page" id="front-page">
    <div class="front-page-start"><div class="front-page-heading"><span class="front-page-kicker">TOP</span><h2>${escapeHtml(edition.frontPageTitle || ui.fallbackTitle)}</h2><span class="front-page-count">${stories.length} ${escapeHtml(highlightLabel)}</span></div>${rows[0] || ""}</div>
    ${rows.slice(1).join("")}
  </section>`;
}

function fallbackRowLayout(articles) {
  const imageCount = articles.filter((article) => hasStoryImage(article)).length;
  if (articles.length === 1)
    return imageCount ? "solo-visual" : "solo-text";
  if (imageCount === 0) return "text-grid";
  if (imageCount === 1) return "mixed-grid";
  return "balanced-grid";
}

function firstRowLayout(section, articles) {
  const requested = section?.presentation?.layout;
  if (layoutNames.has(requested)) {
    const imageCount = articles.filter((article) => hasStoryImage(article)).length;
    if (articles.length === 1)
      return imageCount ? "solo-visual" : "solo-text";
    if (imageCount === 0)
      return requested === "briefs-grid" ? "briefs-grid" : "text-grid";
    if (imageCount === 1 && requested !== "briefs-grid") return "mixed-grid";
    return requested;
  }
  return fallbackRowLayout(articles);
}

function sectionMarkup(section, index, ui, labels) {
  const rows = [];
  for (let offset = 0; offset < section.articles.length; offset += 2) {
    const articles = section.articles.slice(offset, offset + 2);
    const layout =
      offset === 0
        ? firstRowLayout(section, articles)
        : fallbackRowLayout(articles);
    const classes = [
      "section-grid",
      offset === 0 ? "first-row" : "follow-row",
      articles.length === 1 ? "single" : "",
      layout,
    ]
      .filter(Boolean)
      .join(" ");
    rows.push(
      `<div class="${classes}">${articles
        .map((article) => storyCard(article, { ui, labels }))
        .join("")}</div>`,
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
  const visibleSections = (edition.sections || []).filter(
    (section) => Array.isArray(section.articles) && section.articles.length > 0,
  );
  const topStories = Array.isArray(edition.topStories)
    ? edition.topStories.filter(Boolean)
    : [];
  const ui = editionUi(edition);
  const labels = categoryMap(edition);
  const nav = [
    topStories.length
      ? `<a href="#front-page">${escapeHtml(edition.frontPageTitle || ui.fallbackTitle)}</a>`
      : "",
    ...visibleSections.map(
      (section) =>
        `<a href="#${escapeHtml(section.slug)}">${escapeHtml(section.name)}</a>`,
    ),
  ]
    .filter(Boolean)
    .join("");
  const logo = logoDataUri
    ? `<img class="logo" src="${logoDataUri}" alt="${escapeHtml(publication.name)}">`
    : `<div class="logo-fallback">${escapeHtml(initials())}</div>`;
  const frontPage = frontPageMarkup(edition, ui, labels);
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
:root{--bg:${publication.backgroundColor};--paper:${publication.paperColor};--ink:#171717;--muted:#69655d;--red:${publication.accentColor};--line:#d8d0c2;--soft:#ece5d8;--white:#fff;--max:1060px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,"Noto Sans","Noto Sans CJK JP","Noto Sans Arabic",Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}
a{transition:color .15s ease}
.shell{width:min(calc(100% - 34px),var(--max));margin:34px auto 70px;background:var(--paper);box-shadow:0 28px 90px rgba(0,0,0,.45);overflow:hidden}
.masthead{background:var(--ink);color:var(--white);padding:22px 38px 20px;border-top:8px solid var(--red)}
.masthead-row{display:flex;align-items:center;justify-content:space-between;gap:24px}
.brand{display:flex;align-items:center;gap:14px}
.logo,.logo-fallback{width:48px;height:48px;display:block;object-fit:contain}
.logo-fallback{display:grid;place-items:center;border:1px solid #555;font-weight:900}
.brand-name{font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:700;letter-spacing:-.02em}
.brand-tag{margin-top:4px;color:var(--red);font-size:10px;font-weight:800;letter-spacing:.19em}
.edition-date{font-size:11px;line-height:1.4;text-align:end;color:#c9c6c0;text-transform:uppercase;letter-spacing:.1em}
.hero{padding:38px 38px 24px}
.hero-intro{max-width:840px;margin:0;color:var(--muted);font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.55}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
.stat{padding:6px 9px;border:1px solid var(--line);border-radius:999px;font-size:9px;font-weight:700;color:#5d5952;background:rgba(255,255,255,.22)}
.index{display:flex;gap:7px;overflow:auto;padding:0 38px 24px}
.index a{flex:0 0 auto;color:var(--ink);text-decoration:none;border-bottom:1px solid transparent;padding:5px 0;margin-inline-end:12px;font-size:10px;font-weight:800}
.index a:hover{color:var(--red);border-color:var(--red)}
.lead-wrap{padding:0 38px 36px}
.lead-label{margin-bottom:12px;font-size:10px;color:var(--red);font-weight:900;letter-spacing:.16em}
.story-card{background:rgba(255,255,255,.4);border:1px solid var(--line);border-radius:2px;overflow:hidden;break-inside:avoid;page-break-inside:avoid;min-width:0}
.story-image{display:block;width:100%;aspect-ratio:16/9;background:#ded7ca;overflow:hidden}
.story-image img{width:100%;height:100%;object-fit:cover;display:block}
.story-body{text-align:start;padding:17px 18px 18px;min-width:0}
.story-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#7a756c;font-size:8.5px;text-transform:uppercase;letter-spacing:.075em;font-weight:750}
.story-meta .source{color:var(--red)}
.story-card h2,.story-card h3{font-family:Georgia,'Times New Roman',serif;margin:9px 0 10px;letter-spacing:-.025em}
.story-card h2{font-size:31px;line-height:1.02}
.story-card h3{font-size:21px;line-height:1.08}
.story-card h2 a,.story-card h3 a{color:var(--ink);text-decoration:none}
.story-card p{margin:0;color:var(--muted);font-size:12.5px;line-height:1.55}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}
.tags span{padding:4px 7px;background:var(--soft);font-size:8.5px;font-weight:800;color:#5e5951;border-radius:2px}
.read-link{display:inline-block;margin-top:13px;color:var(--red);font-size:9.5px;font-weight:900;text-decoration:none}
.text-card{position:relative;background:transparent;border:0;border-top:4px solid var(--ink);border-bottom:1px solid var(--line);border-radius:0}
.text-card:before{content:"";position:absolute;top:12px;inset-inline-end:18px;width:22px;height:3px;background:var(--red)}
.text-card .story-body{padding:20px 18px 20px}
.text-card h3{font-size:25px;line-height:1.04;max-width:94%;margin-top:12px}
.text-card p{font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.58;max-width:96%}
.text-card .tags span{background:transparent;border:1px solid var(--line)}
.role-feature h3{font-size:27px;line-height:1.02}
.role-brief{background:transparent;border:0;border-top:3px solid var(--ink);border-radius:0}
.role-brief:before{display:none}
.role-brief .story-body{padding:16px 4px 14px}
.role-brief h3{font-size:19px;line-height:1.08;margin:8px 0 8px;max-width:100%}
.role-brief p{font-family:inherit;font-size:11.5px;line-height:1.48;max-width:100%}
.role-brief .read-link{margin-top:9px}
.lead-card{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(300px,.88fr);background:var(--ink);border:0;color:white}
.lead-card .story-image{height:100%;aspect-ratio:auto;min-height:315px}
.lead-card .story-body{padding:27px 28px 25px}
.lead-card .story-meta{color:#aaa}
.lead-card .story-meta .source{color:var(--red)}
.lead-card h2 a{color:#fff}
.lead-card p{color:#c8c5bf;font-size:13.5px}
.lead-card .tags span{background:#2a2a2e;color:#d6d3cd}
.lead-card .read-link{color:var(--red)}
.lead-card.no-image{display:block;background:var(--ink);border:0;border-top:7px solid var(--red);padding:5px 0}
.lead-card.no-image:before{display:none}
.lead-card.no-image .story-body{padding:31px 36px 33px;max-width:900px}
.lead-card.no-image h2{font-size:41px;line-height:.99;max-width:820px;margin:14px 0 17px}
.lead-card.no-image p{max-width:720px;color:#d0cdc7;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.58}
.front-page{padding:0 38px 36px}
.front-page-heading,.section-title{display:grid;grid-template-columns:42px 1fr auto;align-items:end;gap:10px;padding:15px 0 13px}
.front-page-heading{border-top:4px solid var(--red)}
.front-page-heading h2,.section-title h2{margin:0;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:1}
.front-page-kicker,.section-number{color:var(--red);font-size:10px;font-weight:900;letter-spacing:.12em}
.front-page-count,.section-count{font-size:8.5px;font-weight:800;color:#817b72;text-transform:uppercase;letter-spacing:.08em}
.front-page-start,.section-start{break-inside:avoid;page-break-inside:avoid}
.front-page-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;break-inside:avoid;page-break-inside:avoid;border-top:1px solid var(--line)}
.front-story{display:grid;grid-template-columns:34px minmax(0,1fr);gap:12px;padding:17px 0 18px;break-inside:avoid;page-break-inside:avoid;border-bottom:1px solid var(--line)}
.front-story:nth-child(odd){padding-inline-end:10px}
.front-story:nth-child(even){padding-inline-start:10px}
.front-rank{color:var(--red);font-size:10px;font-weight:900;letter-spacing:.08em;padding-top:4px}
.front-meta{display:flex;gap:8px;flex-wrap:wrap;color:#7a756c;font-size:8px;text-transform:uppercase;letter-spacing:.07em;font-weight:800}
.front-meta span:first-child{color:var(--red)}
.front-story h3{font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:1.08;letter-spacing:-.02em;margin:7px 0}
.front-story h3 a{color:var(--ink);text-decoration:none}
.front-story p{margin:0;color:var(--muted);font-size:11.5px;line-height:1.45}
.newsletter-section{padding:0 38px 34px;break-inside:auto}
.section-title{border-top:4px solid var(--ink)}
.section-grid+.section-grid,.section-start+.section-grid{margin-top:14px}
.section-grid{break-inside:avoid;page-break-inside:avoid;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}
.section-grid.single{grid-template-columns:1fr}
.section-grid.solo-visual .story-card{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);align-items:stretch}
.section-grid.solo-visual .story-image{height:100%;aspect-ratio:auto;min-height:235px;max-height:320px}
.section-grid.solo-visual .story-body{align-self:center;padding:24px 26px}
.section-grid.solo-visual .story-card h3{font-size:28px}
.section-grid.solo-text{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 0}
.section-grid.solo-text .text-card{border-top:0;border-bottom:0}
.section-grid.solo-text .text-card:before{top:8px}
.section-grid.solo-text .story-body{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(250px,.82fr);grid-template-areas:"meta meta" "title summary" "title tags" "read summary";column-gap:34px;row-gap:6px;padding:12px 20px 14px}
.section-grid.solo-text .story-meta{grid-area:meta}
.section-grid.solo-text h3{grid-area:title;font-size:30px;line-height:1.02;margin:8px 0 5px;max-width:100%}
.section-grid.solo-text p{grid-area:summary;align-self:start;font-size:13px;line-height:1.58;max-width:100%;padding-top:8px}
.section-grid.solo-text .tags{grid-area:tags;margin-top:3px;align-self:start}
.section-grid.solo-text .read-link{grid-area:read;margin-top:4px;align-self:end}
.section-grid.feature-grid{grid-template-columns:minmax(0,1.32fr) minmax(250px,.68fr);gap:20px}
.section-grid.feature-grid:has(>.role-feature:nth-child(2)){grid-template-columns:minmax(250px,.68fr) minmax(0,1.32fr)}
.section-grid.feature-grid .role-feature .story-image{aspect-ratio:16/8.8}
.section-grid.feature-grid .role-brief{align-self:start}
.section-grid.balanced-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.section-grid.mixed-grid{grid-template-columns:minmax(0,1.2fr) minmax(250px,.8fr);gap:22px}
.section-grid.mixed-grid:has(>.has-image:nth-child(2)){grid-template-columns:minmax(250px,.8fr) minmax(0,1.2fr)}
.section-grid.mixed-grid .has-image .story-image{aspect-ratio:16/9;max-height:245px}
.section-grid.mixed-grid .role-brief{align-self:start;margin-top:0}
.section-grid.text-grid,.section-grid.briefs-grid{gap:26px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 0}
.section-grid.text-grid .text-card,.section-grid.briefs-grid .story-card{border-bottom:0}
.section-grid.text-grid .text-card:first-child,.section-grid.briefs-grid .story-card:first-child{border-inline-end:1px solid var(--line);padding-inline-end:12px}
.section-grid.briefs-grid .story-card{background:transparent;border-top:3px solid var(--ink);border-radius:0}
.section-grid.briefs-grid .story-card .story-image{display:none}
.section-grid.briefs-grid .story-card .story-body{padding:16px 4px 14px}
.section-grid.runtime-text{grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 0}
.section-grid.runtime-text.single{grid-template-columns:1fr}
.footer{display:flex;justify-content:space-between;gap:20px;margin-top:8px;padding:24px 38px 28px;background:#e8e0d2;color:#6d675f;font-size:10px}
.footer strong{color:var(--ink)}
html[dir=rtl] .tags{direction:rtl}
@media(max-width:760px){
  .shell{width:100%;margin:0;box-shadow:none}
  .masthead,.hero,.lead-wrap,.front-page,.newsletter-section,.footer{padding-left:20px;padding-right:20px}
  .index{padding-left:20px;padding-right:20px}
  .masthead-row{align-items:flex-start}.brand-name{font-size:23px}.edition-date{font-size:9px}.hero-intro{font-size:17px}
  .lead-card,.section-grid.solo-visual .story-card{grid-template-columns:1fr}
  .lead-card .story-image,.section-grid.solo-visual .story-image{min-height:210px;max-height:none;aspect-ratio:16/9}
  .lead-card.no-image h2{font-size:34px}.lead-card.no-image .story-body{padding:28px 24px 30px}
  .front-page-row,.section-grid,.section-grid.feature-grid,.section-grid.balanced-grid,.section-grid.mixed-grid,.section-grid.text-grid,.section-grid.briefs-grid,.section-grid.runtime-text,.section-grid.feature-grid:has(>.role-feature:nth-child(2)),.section-grid.mixed-grid:has(>.has-image:nth-child(2)){grid-template-columns:1fr}
  .front-story:nth-child(odd),.front-story:nth-child(even){padding-inline-start:0;padding-inline-end:0}
  .section-grid.text-grid,.section-grid.briefs-grid,.section-grid.runtime-text{gap:12px}
  .section-grid.text-grid .text-card:first-child,.section-grid.briefs-grid .story-card:first-child{border-inline-end:0;padding-inline-end:0}
  .section-grid.solo-text .story-body{display:block;padding:17px 4px}.section-grid.solo-text p{padding-top:0}.section-grid.solo-text .tags,.section-grid.solo-text .read-link{margin-top:10px}
  .text-card h3{font-size:24px}
}
@page{size:A4;margin:9mm}
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  html,body{background:#fff}.shell{width:100%;margin:0;box-shadow:none;overflow:visible}
  .masthead{padding:15px 22px 14px;border-top-width:5px}.logo,.logo-fallback{width:38px;height:38px}.brand-name{font-size:23px}.brand-tag{font-size:8px}.edition-date{font-size:8px}
  .hero{padding:20px 22px 15px}.hero-intro{font-size:13px;max-width:650px}.stats{margin-top:12px}.stat{font-size:7.5px;padding:4px 6px}.index{display:none}
  .lead-wrap{padding:0 22px 20px}.lead-label{font-size:8px;margin-bottom:8px}.lead-card{grid-template-columns:1.06fr .94fr}.lead-card .story-image{min-height:235px}.lead-card .story-body{padding:17px 18px}.lead-card.no-image{padding:3px 0;border-top-width:5px}.lead-card.no-image .story-body{padding:20px 23px 22px}.lead-card.no-image h2{font-size:30px;line-height:1}.lead-card.no-image p{font-size:10.5px;max-width:620px}
  .front-page,.newsletter-section{padding-left:22px;padding-right:22px;padding-bottom:22px}.front-page-heading,.section-title{padding:10px 0 9px;border-top-width:3px}.front-page-heading h2,.section-title h2{font-size:23px}.front-page-kicker,.section-number{font-size:7.5px}.front-page-count,.section-count{font-size:7px}.front-story{padding:11px 0 12px;grid-template-columns:26px 1fr;gap:8px}.front-story h3{font-size:15px}.front-story p{font-size:9px}.front-meta{font-size:6.5px}
  .section-grid{gap:10px}.section-grid+.section-grid,.section-start+.section-grid{margin-top:9px}.story-body{padding:11px 12px 12px}.story-meta{font-size:6.5px}.story-card h3{font-size:16px;margin:6px 0 7px}.story-card p{font-size:9px;line-height:1.42}.tags{margin-top:7px}.tags span{font-size:6.5px;padding:2px 4px}.read-link{font-size:7px;margin-top:8px}
  .text-card{border-top-width:3px}.text-card .story-body{padding:13px 11px 12px}.text-card h3{font-size:18px}.text-card p{font-size:9.5px}.text-card:before{top:8px;width:16px;height:2px;inset-inline-end:11px}
  .role-feature h3{font-size:19px}.role-brief .story-body{padding:11px 2px 10px}.role-brief h3{font-size:14px}.role-brief p{font-size:8.5px}
  .section-grid.solo-visual .story-card{grid-template-columns:1fr 1fr}.section-grid.solo-visual .story-image{min-height:175px;max-height:220px}.section-grid.solo-visual .story-body{padding:15px 16px}.section-grid.solo-visual .story-card h3{font-size:20px}
  .section-grid.solo-text{padding:9px 0}.section-grid.solo-text .story-body{grid-template-columns:minmax(0,1.15fr) minmax(210px,.85fr);column-gap:22px;padding:8px 11px 9px}.section-grid.solo-text h3{font-size:21px}.section-grid.solo-text p{font-size:9.5px;padding-top:6px}
  .section-grid.feature-grid,.section-grid.mixed-grid{gap:14px}.section-grid.feature-grid{grid-template-columns:1.25fr .75fr}.section-grid.feature-grid:has(>.role-feature:nth-child(2)){grid-template-columns:.75fr 1.25fr}.section-grid.mixed-grid{grid-template-columns:1.16fr .84fr}.section-grid.mixed-grid:has(>.has-image:nth-child(2)){grid-template-columns:.84fr 1.16fr}.section-grid.mixed-grid .has-image .story-image{max-height:185px}
  .section-grid.text-grid,.section-grid.briefs-grid,.section-grid.runtime-text{gap:16px;padding:9px 0}
  .footer{padding:16px 22px 18px;font-size:7.5px}
}
</style>
</head>
<body>
<div class="shell">
  <header class="masthead"><div class="masthead-row"><div class="brand">${logo}<div><div class="brand-name">${escapeHtml(publication.name)}</div><div class="brand-tag">${escapeHtml(ui.brandTagline)}</div></div></div><div class="edition-date">${escapeHtml(ui.dailyEdition)}<br>${escapeHtml(formatDate(edition.editionDate))}</div></div></header>
  <section class="hero"><p class="hero-intro">${escapeHtml(edition.intro || ui.fallbackIntro)}</p><div class="stats"><span class="stat">${escapeHtml(countLabel(edition.stats?.stories, ui.storySingular, ui.storyPlural))}</span><span class="stat">${escapeHtml(countLabel(edition.stats?.sources, ui.sourceSingular, ui.sourcePlural))}</span>${profileStat}</div></section>
  <nav class="index">${nav}</nav>
  <main>
    <section class="lead-wrap"><div class="lead-label">${escapeHtml(ui.leadLabel)}</div>${storyCard(edition.lead, { lead: true, role: "feature", ui, labels })}</section>
    ${frontPage}
    ${sections}
  </main>
  <footer class="footer"><strong>${escapeHtml(publication.name)}</strong><span>${escapeHtml(formatDate(edition.editionDate))}</span></footer>
</div>
</body>
</html>`;
}
