import {
  categories,
  config,
  editorial,
  profile,
  publication,
} from "../config.mjs";
import { uiCatalog } from "../services/i18n.mjs";

const FRONT_PAGE_TARGET = 4;
const FRONT_PAGE_MAX = 5;

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

function sectionScore(article) {
  const value = Number(article?.sectionScore ?? article?.score ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function recency(article) {
  return new Date(article?.publishedAt || 0).getTime() || 0;
}

function editorialSort(a, b) {
  return (
    frontPageScore(b) - frontPageScore(a) ||
    sectionScore(b) - sectionScore(a) ||
    recency(b) - recency(a)
  );
}

function chooseLead(requestedLead, articles) {
  const strongest =
    articles.filter(Boolean).slice().sort(editorialSort)[0] || null;

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

function registerSource(article, globalCounts, sectionCounts = null) {
  const source = article.publisherGroup || article.source;
  globalCounts.set(source, (globalCounts.get(source) || 0) + 1);
  if (sectionCounts)
    sectionCounts.set(source, (sectionCounts.get(source) || 0) + 1);
}

function requestedTopStoryIds(curated) {
  const values =
    curated?.topStoryIds ??
    curated?.topStories ??
    curated?.highlights ??
    curated?.destaques ??
    [];
  return Array.isArray(values)
    ? values.map(curatedId).filter((id) => id != null)
    : [];
}

function chooseTopStories(curated, sectionArticles, lead) {
  const byId = new Map(
    sectionArticles.map((article) => [Number(article.id), article]),
  );
  const requestedIds = requestedTopStoryIds(curated);
  const desired =
    requestedIds.length >= 3
      ? Math.min(FRONT_PAGE_MAX, requestedIds.length)
      : Math.min(FRONT_PAGE_TARGET, sectionArticles.length);
  const selected = [];
  const selectedIds = new Set();
  const seenCategories = new Set();
  const seenTopics = new Set();
  const sourceCounts = new Map();

  const tryAdd = (article, { requireFreshCategory = false } = {}) => {
    if (
      !article ||
      article.id === lead?.id ||
      selectedIds.has(article.id) ||
      selected.length >= desired
    )
      return false;
    const topic = String(article.topicKey || "").trim();
    if (topic && seenTopics.has(topic)) return false;
    if (requireFreshCategory && seenCategories.has(article.category))
      return false;
    if (!canUseSource(article, sourceCounts, new Map())) return false;
    selected.push(article);
    selectedIds.add(article.id);
    seenCategories.add(article.category);
    if (topic) seenTopics.add(topic);
    registerSource(article, sourceCounts);
    return true;
  };

  for (const id of requestedIds) tryAdd(byId.get(id));

  const candidates = sectionArticles.slice().sort(editorialSort);
  for (const article of candidates) {
    if (selected.length >= desired) break;
    tryAdd(article, { requireFreshCategory: true });
  }
  for (const article of candidates) {
    if (selected.length >= desired) break;
    tryAdd(article);
  }

  return selected;
}

function sectionOrder(articles) {
  return categories
    .filter((category) =>
      articles.some((article) => article.category === category.slug),
    )
    .map((category) => category.slug);
}

function uniqueStories(stories) {
  const seen = new Set();
  return stories.filter((story) => {
    if (!story) return false;
    const key = story.id ?? story.link;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeNewsletter(curated, articles, editionDate) {
  const byId = new Map(
    articles.map((article) => [Number(article.id), article]),
  );
  const categoryBySlug = new Map(
    categories.map((category) => [category.slug, category]),
  );
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

  let backfilled = 0;
  let diversityRelaxed = 0;
  const usedSectionIds = new Set();
  const globalSourceCounts = new Map();
  const sections = sectionOrder(articles)
    .map((slug) => {
      const category = categoryBySlug.get(slug);
      if (!category) return null;
      const requested = Array.isArray(curated?.sections?.[category.slug])
        ? curated.sections[category.slug]
        : [];
      const selected = [];
      const sectionSourceCounts = new Map();

      const tryAdd = (article, { relaxed = false, backfill = false } = {}) => {
        if (
          !article ||
          article.category !== category.slug ||
          usedSectionIds.has(article.id)
        )
          return false;
        if (
          !relaxed &&
          !canUseSource(article, globalSourceCounts, sectionSourceCounts)
        )
          return false;
        usedSectionIds.add(article.id);
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
            article.category === category.slug &&
            !usedSectionIds.has(article.id),
        )
        .sort(
          (a, b) =>
            sectionScore(b) - sectionScore(a) ||
            frontPageScore(b) - frontPageScore(a) ||
            recency(b) - recency(a),
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
              article.category === category.slug &&
              !usedSectionIds.has(article.id),
          )
          .sort(
            (a, b) =>
              sectionScore(b) - sectionScore(a) || recency(b) - recency(a),
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
    })
    .filter((section) => section?.articles?.length);

  const sectionArticles = sections.flatMap((section) => section.articles);
  const topStories = chooseTopStories(curated, sectionArticles, lead);
  const chosen = uniqueStories([lead, ...topStories, ...sectionArticles]);
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
    // This is UI copy, not an editorial decision. Keep it deterministic and
    // localized so the model can never leak internal labels such as "Front Page".
    frontPageTitle: fallback.title,
    ui: normalizeUi(curated?.ui),
    lead,
    topStories,
    sectionOrder: sections.map((section) => section.slug),
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(
        chosen.map((article) => article.publisherGroup || article.source),
      ).size,
      candidates: articles.length,
      topStories: topStories.length,
      visibleSections: sections.length,
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
