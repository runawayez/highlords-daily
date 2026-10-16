import { editorialStyles } from "./presentation/editorial-styles.mjs";
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
  if (/^(?:assets\/|\.\/assets\/)/i.test(raw)) return raw.replace(/^\.\//, "");
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
    String(article.headline || article.originalTitle || "").length > 110
      ? "long-headline"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<article class="${classes}" data-story-id="${escapeHtml(article.stableId || article.link || article.id || "")}">
    ${image}
    <div class="story-body">
      <div class="story-meta"><span class="source">${escapeHtml(article.source)}</span><span>${escapeHtml(category)}</span>${article.provenance?.languageFallback ? `<span>${escapeHtml(ui.sourceLanguage)}: ${escapeHtml(article.language || "und")}</span>` : ""}</div>
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
  const imageCount = articles.filter((article) =>
    hasStoryImage(article),
  ).length;
  if (articles.length === 1) return imageCount ? "solo-visual" : "solo-text";
  if (imageCount === 0) return "text-grid";
  if (imageCount === 1) return "mixed-grid";
  return "balanced-grid";
}

function firstRowLayout(section, articles) {
  const requested = section?.presentation?.layout;
  if (layoutNames.has(requested)) {
    const imageCount = articles.filter((article) =>
      hasStoryImage(article),
    ).length;
    if (articles.length === 1) return imageCount ? "solo-visual" : "solo-text";
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
  const stats = `<div class="edition-stats"><span class="stat">${escapeHtml(countLabel(edition.stats?.stories, ui.storySingular, ui.storyPlural))}</span><span class="stat">${escapeHtml(countLabel(edition.stats?.sources, ui.sourceSingular, ui.sourcePlural))}</span>${profileStat}</div>`;

  return `<!doctype html>
<html lang="${escapeHtml(config.language)}" dir="${direction}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(publication.name)} — ${escapeHtml(edition.editionDate)}</title>
<style>
${editorialStyles(publication)}
</style>
</head>
<body>
<div class="shell" data-design="editorial-v2" data-edition-date="${escapeHtml(edition.editionDate)}" data-preview-notice="${escapeHtml(edition.previewNotice || "")}">
  <header class="masthead"><div class="masthead-row"><div class="brand">${logo}<div><div class="brand-tag">${escapeHtml(ui.brandTagline)}</div><div class="brand-name">${escapeHtml(publication.name)}</div></div></div><div class="edition-date">${escapeHtml(ui.dailyEdition)}<br>${escapeHtml(formatDate(edition.editionDate))}</div></div></header>
  ${edition.previewNotice ? `<p class="preview-notice">${escapeHtml(edition.previewNotice)}</p>` : ""}
  <nav class="index">${nav}</nav>
  <main>
    <section class="lead-wrap"><div class="lead-label">${escapeHtml(ui.leadLabel)}</div>${storyCard(edition.lead, { lead: true, role: "feature", ui, labels })}</section>
    ${stats}
    ${frontPage}
    ${sections}
  </main>
  <footer class="footer"><strong>${escapeHtml(publication.name)}</strong><a href="../index.html">${escapeHtml(ui.archiveTitle)}</a><span>${escapeHtml(formatDate(edition.editionDate))}</span></footer>
</div>
</body>
</html>`;
}
