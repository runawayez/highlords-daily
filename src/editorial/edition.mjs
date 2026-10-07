import {
  categories,
  config,
  editorial,
  profile,
  publication,
} from "../config.mjs";
import { uiCatalog } from "../services/i18n.mjs";
function curatedId(value) {
  const raw =
    value && typeof value === "object"
      ? (value.id ??
        value.articleId ??
        value.article_id ??
        value.newsId ??
        value.news_id)
      : value;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function frontPageScore(article) {
  const value = Number(article?.frontPageScore ?? article?.score ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function chooseLead(requestedLead, articles) {
  const strongest =
    articles
      .filter(Boolean)
      .slice()
      .sort(
        (a, b) =>
          frontPageScore(b) - frontPageScore(a) ||
          Number(b.sectionScore ?? b.score ?? 0) -
            Number(a.sectionScore ?? a.score ?? 0) ||
          new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
      )[0] || null;

  if (!requestedLead) return { lead: strongest, rebalanced: false };
  if (!strongest) return { lead: requestedLead, rebalanced: false };

  const tolerance = 0.35;
  if (frontPageScore(requestedLead) >= frontPageScore(strongest) - tolerance) {
    return { lead: requestedLead, rebalanced: false };
  }
  return { lead: strongest, rebalanced: strongest.id !== requestedLead.id };
}

function fallbackCopy() {
  const ui = uiCatalog();
  return { title: ui.fallbackTitle, intro: ui.fallbackIntro };
}

function localizedSectionName(curated, category) {
  const value = curated?.sectionTitles?.[category.slug];
  if (typeof value === "string" && value.trim())
    return value.trim().slice(0, 80);
  return category.name;
}

function normalizeUi(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, text]) => typeof text === "string" && text.trim())
      .map(([key, text]) => [key, text.trim().slice(0, 120)]),
  );
}

function canUseSource(article, globalCounts, sectionCounts) {
  const global =
    globalCounts.get(article.publisherGroup || article.source) || 0;
  const section =
    sectionCounts.get(article.publisherGroup || article.source) || 0;
  if (config.maxItemsPerSource > 0 && global >= config.maxItemsPerSource)
    return false;
  if (
    config.maxItemsPerSourcePerSection > 0 &&
    section >= config.maxItemsPerSourcePerSection
  )
    return false;
  return true;
}

function registerSource(article, globalCounts, sectionCounts) {
  globalCounts.set(
    article.publisherGroup || article.source,
    (globalCounts.get(article.publisherGroup || article.source) || 0) + 1,
  );
  sectionCounts.set(
    article.publisherGroup || article.source,
    (sectionCounts.get(article.publisherGroup || article.source) || 0) + 1,
  );
}

export function normalizeNewsletter(curated, articles, editionDate) {
  const byId = new Map(
    articles.map((article) => [Number(article.id), article]),
  );
  const used = new Set();
  const globalSourceCounts = new Map();
  const requestedLeadId = curatedId(
    curated?.leadId ??
      curated?.lead ??
      curated?.headlineId ??
      curated?.mancheteId,
  );
  const requestedLead =
    requestedLeadId != null ? byId.get(requestedLeadId) : null;
  const { lead: rawLead, rebalanced: leadRebalanced } = chooseLead(
    requestedLead,
    articles,
  );
  const lead = rawLead
    ? {
        ...rawLead,
        score: Number(rawLead.frontPageScore ?? rawLead.score ?? 0),
      }
    : null;
  if (lead) {
    used.add(lead.id);
    globalSourceCounts.set(lead.publisherGroup || lead.source, 1);
  }

  let backfilled = 0;
  let diversityRelaxed = 0;
  const sections = categories.map((category) => {
    const requested = Array.isArray(curated?.sections?.[category.slug])
      ? curated.sections[category.slug]
      : [];
    const selected = [];
    const sectionSourceCounts = new Map();

    const tryAdd = (article, { relaxed = false, backfill = false } = {}) => {
      if (
        !article ||
        article.category !== category.slug ||
        used.has(article.id)
      )
        return false;
      if (
        !relaxed &&
        !canUseSource(article, globalSourceCounts, sectionSourceCounts)
      )
        return false;
      used.add(article.id);
      selected.push(article);
      registerSource(article, globalSourceCounts, sectionSourceCounts);
      if (backfill) backfilled += 1;
      if (relaxed) diversityRelaxed += 1;
      return true;
    };

    for (const rawValue of requested) {
      const id = curatedId(rawValue);
      if (id == null) continue;
      tryAdd(byId.get(id));
      if (selected.length >= config.itemsPerCategory) break;
    }

    const candidates = articles
      .filter(
        (article) =>
          article.category === category.slug && !used.has(article.id),
      )
      .sort(
        (a, b) =>
          Number(b.sectionScore ?? b.score ?? 0) -
            Number(a.sectionScore ?? a.score ?? 0) ||
          new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
      );
    for (const article of candidates) {
      if (selected.length >= config.itemsPerCategory) break;
      tryAdd(article, { backfill: true });
    }

    if (
      selected.length < config.itemsPerCategory &&
      !config.sourceDiversityStrict
    ) {
      const relaxedCandidates = articles
        .filter(
          (article) =>
            article.category === category.slug && !used.has(article.id),
        )
        .sort(
          (a, b) =>
            Number(b.sectionScore ?? b.score ?? 0) -
            Number(a.sectionScore ?? a.score ?? 0),
        );
      for (const article of relaxedCandidates) {
        if (selected.length >= config.itemsPerCategory) break;
        tryAdd(article, { relaxed: true, backfill: true });
      }
    }

    return {
      slug: category.slug,
      name: localizedSectionName(curated, category),
      articles: selected,
    };
  });

  const chosen = [
    lead,
    ...sections.flatMap((section) => section.articles),
  ].filter(Boolean);
  const fallback = fallbackCopy();
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: "ollama",
    selectionMode: backfilled > 0 ? "ollama+section-backfill" : "ollama",
    preset: editorial.preset,
    profile: profile.name,
    language: config.language,
    editorialContext: config.editorialContext,
    publication: publication.name,
    title: String(curated?.title || fallback.title)
      .trim()
      .slice(0, 120),
    intro: String(curated?.intro || fallback.intro)
      .trim()
      .slice(0, 420),
    ui: normalizeUi(curated?.ui),
    lead,
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(
        chosen.map((article) => article.publisherGroup || article.source),
      ).size,
      candidates: articles.length,
      backfilled,
      diversityRelaxed,
      leadRebalanced,
      leadFrontPageScore: lead
        ? Number(lead.frontPageScore ?? lead.score ?? 0)
        : null,
    },
  };
}

export function fallbackNewsletter(articles, editionDate) {
  const fallback = fallbackCopy();
  const edition = normalizeNewsletter(
    {
      leadId: articles[0]?.id,
      title: fallback.title,
      intro: fallback.intro,
      sections: {},
    },
    articles,
    editionDate,
  );
  edition.selectionMode = "ranking-fallback";
  return edition;
}
