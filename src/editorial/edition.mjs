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

function sectionSort(a, b) {
  return (
    sectionScore(b) - sectionScore(a) ||
    frontPageScore(b) - frontPageScore(a) ||
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

function normalizeUi(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, text]) => typeof text === "string" && text.trim())
      .map(([key, text]) => [key, text.trim().slice(0, 120)]),
  );
}

function sourceKey(article) {
  return article?.publisherGroup || article?.source || "unknown";
}

function canUseSource(article, globalCounts, sectionCounts) {
  const source = sourceKey(article);
  const global = globalCounts.get(source) || 0;
  const section = sectionCounts.get(source) || 0;
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
  const source = sourceKey(article);
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
      Number(article.id) === Number(lead?.id) ||
      selectedIds.has(Number(article.id)) ||
      selected.length >= desired
    )
      return false;
    const topic = String(article.topicKey || "").trim();
    if (topic && seenTopics.has(topic)) return false;
    if (requireFreshCategory && seenCategories.has(article.category))
      return false;
    if (!canUseSource(article, sourceCounts, new Map())) return false;
    selected.push(article);
    selectedIds.add(Number(article.id));
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

function requestedIdsForSection(curated, slug) {
  const values = Array.isArray(curated?.sections?.[slug])
    ? curated.sections[slug]
    : [];
  return values.map(curatedId).filter((id) => id != null);
}

function buildCoveragePlan(curated, articles, lead) {
  const categoryBySlug = new Map(
    categories.map((category) => [category.slug, category]),
  );
  const byId = new Map(
    articles.map((article) => [Number(article.id), article]),
  );
  const leadId = lead ? Number(lead.id) : null;
  const usedIds = new Set(leadId == null ? [] : [leadId]);
  const globalSourceCounts = new Map();
  const states = sectionOrder(articles).map((slug) => {
    const category = categoryBySlug.get(slug);
    const requested = requestedIdsForSection(curated, slug)
      .map((id) => byId.get(id))
      .filter(
        (article) =>
          article && article.category === slug && Number(article.id) !== leadId,
      );
    const requestedSet = new Set(
      requested.map((article) => Number(article.id)),
    );
    const fallback = articles
      .filter(
        (article) =>
          article.category === slug &&
          Number(article.id) !== leadId &&
          !requestedSet.has(Number(article.id)),
      )
      .sort(sectionSort);
    return {
      category,
      requested,
      candidates: [...requested, ...fallback],
      selected: [],
      sectionSourceCounts: new Map(),
    };
  });

  let backfilled = 0;
  let diversityRelaxed = 0;

  const tryAdd = (
    state,
    article,
    { relaxed = false, backfill = false } = {},
  ) => {
    if (
      !article ||
      article.category !== state.category.slug ||
      usedIds.has(Number(article.id))
    )
      return false;
    if (
      !relaxed &&
      !canUseSource(article, globalSourceCounts, state.sectionSourceCounts)
    )
      return false;
    usedIds.add(Number(article.id));
    state.selected.push(article);
    registerSource(article, globalSourceCounts, state.sectionSourceCounts);
    if (backfill) backfilled += 1;
    if (relaxed) diversityRelaxed += 1;
    return true;
  };

  // Pass 1: coverage first. Every category with a viable non-lead candidate
  // gets one slot before any category is allowed to consume a second slot.
  for (const state of states) {
    for (let index = 0; index < state.candidates.length; index += 1) {
      const article = state.candidates[index];
      const backfill = !state.requested.some(
        (item) => Number(item.id) === Number(article.id),
      );
      if (tryAdd(state, article, { backfill })) break;
    }
    if (!state.selected.length && state.candidates.length) {
      // Coverage is more important than source-diversity quotas for the first
      // story of a section. Relax only this constraint, never category identity.
      const article = state.candidates.find(
        (candidate) => !usedIds.has(Number(candidate.id)),
      );
      if (article)
        tryAdd(state, article, {
          relaxed: true,
          backfill: !state.requested.some(
            (item) => Number(item.id) === Number(article.id),
          ),
        });
    }
  }

  // Pass 2: after coverage, fill secondary slots by editorial strength.
  for (const state of states) {
    for (const article of state.candidates) {
      if (state.selected.length >= config.itemsPerCategory) break;
      tryAdd(state, article, {
        backfill: !state.requested.some(
          (item) => Number(item.id) === Number(article.id),
        ),
      });
    }
    if (
      state.selected.length < config.itemsPerCategory &&
      !config.sourceDiversityStrict
    ) {
      for (const article of state.candidates) {
        if (state.selected.length >= config.itemsPerCategory) break;
        tryAdd(state, article, {
          relaxed: true,
          backfill: !state.requested.some(
            (item) => Number(item.id) === Number(article.id),
          ),
        });
      }
    }
  }

  const sections = states
    .filter((state) => state.selected.length)
    .map((state) => ({
      slug: state.category.slug,
      // Category labels come exclusively from the configured taxonomy.
      // The LLM may classify and rank, but it may never rename a section.
      name: state.category.name,
      articles: state.selected,
    }));

  const missing = categories
    .filter(
      (category) => !sections.some((section) => section.slug === category.slug),
    )
    .map((category) => {
      const pool = articles.filter(
        (article) => article.category === category.slug,
      );
      const nonLead = pool.filter((article) => Number(article.id) !== leadId);
      let reason = "no-candidate-after-analysis";
      if (pool.length && !nonLead.length && lead?.category === category.slug)
        reason = "lead-only";
      else if (nonLead.length) reason = "selection-constraints";
      return { slug: category.slug, name: category.name, reason };
    });

  return {
    sections,
    backfilled,
    diversityRelaxed,
    coverage: {
      configured: categories.length,
      categoriesWithCandidates: new Set(
        articles.map((article) => article.category),
      ).size,
      selectableCategories: states.filter((state) => state.candidates.length)
        .length,
      visible: sections.length,
      missing,
    },
  };
}

export function validateNewsletterContract(edition) {
  const errors = [];
  const categoryBySlug = new Map(
    categories.map((category) => [category.slug, category]),
  );
  const seenSectionSlugs = new Set();
  const seenSectionNames = new Set();
  const seenStoryIds = new Set();
  const leadId = edition?.lead ? Number(edition.lead.id) : null;

  for (const section of edition?.sections || []) {
    if (!categoryBySlug.has(section.slug))
      errors.push(`unknown-section:${section.slug}`);
    if (seenSectionSlugs.has(section.slug))
      errors.push(`duplicate-section-slug:${section.slug}`);
    seenSectionSlugs.add(section.slug);

    const canonical = categoryBySlug.get(section.slug)?.name;
    if (canonical && section.name !== canonical)
      errors.push(`noncanonical-section-name:${section.slug}`);
    const nameKey = String(section.name || "")
      .trim()
      .toLocaleLowerCase(config.language);
    if (nameKey && seenSectionNames.has(nameKey))
      errors.push(`duplicate-section-name:${section.name}`);
    if (nameKey) seenSectionNames.add(nameKey);

    for (const article of section.articles || []) {
      const id = Number(article.id);
      if (article.category !== section.slug)
        errors.push(
          `category-mismatch:${id}:${section.slug}:${article.category}`,
        );
      if (leadId != null && id === leadId)
        errors.push(`lead-repeated-in-section:${section.slug}:${id}`);
      if (seenStoryIds.has(id)) errors.push(`duplicate-section-story:${id}`);
      seenStoryIds.add(id);
    }
  }

  const order = (edition?.sections || []).map((section) => section.slug);
  if (JSON.stringify(order) !== JSON.stringify(edition?.sectionOrder || []))
    errors.push("section-order-mismatch");

  for (const story of edition?.topStories || []) {
    if (!seenStoryIds.has(Number(story.id)))
      errors.push(`top-story-without-section:${story.id}`);
  }

  const expected = Number(edition?.stats?.coverage?.selectableCategories || 0);
  const visible = Number(edition?.stats?.coverage?.visible || 0);
  if (visible < expected) errors.push(`coverage-gap:${visible}/${expected}`);

  return { ok: errors.length === 0, errors };
}

export function normalizeNewsletter(curated, articles, editionDate) {
  const byId = new Map(
    articles.map((article) => [Number(article.id), article]),
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

  const plan = buildCoveragePlan(curated, articles, lead);
  const sectionArticles = plan.sections.flatMap((section) => section.articles);
  const topStories = chooseTopStories(curated, sectionArticles, lead);
  const chosen = uniqueStories([lead, ...topStories, ...sectionArticles]);
  const fallback = fallbackCopy();
  const edition = {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: "ollama",
    selectionMode: plan.backfilled > 0 ? "ollama+section-backfill" : "ollama",
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
    frontPageTitle: fallback.title,
    ui: normalizeUi(curated?.ui),
    lead,
    topStories,
    sectionOrder: plan.sections.map((section) => section.slug),
    sections: plan.sections,
    stats: {
      stories: chosen.length,
      sources: new Set(chosen.map((article) => sourceKey(article))).size,
      candidates: articles.length,
      topStories: topStories.length,
      visibleSections: plan.sections.length,
      coverage: plan.coverage,
      backfilled: plan.backfilled,
      diversityRelaxed: plan.diversityRelaxed,
      leadRebalanced,
      leadFrontPageScore: lead
        ? Number(lead.frontPageScore ?? lead.score ?? 0)
        : null,
    },
  };

  const contract = validateNewsletterContract(edition);
  if (!contract.ok) {
    throw new Error(`Editorial contract failed: ${contract.errors.join(", ")}`);
  }
  return edition;
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
