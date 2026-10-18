import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../src/config.mjs";
import { normalizeText, wordTokens } from "../src/utils/text.mjs";

export const name = "editorial-presentation";

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "por",
  "com",
  "sem",
  "que",
  "como",
  "mais",
  "the",
  "and",
  "for",
  "with",
  "from",
]);

const visualRiskPattern =
  /(?:^|[\/_.-])(?:logo|favicon|sprite|tracking[-_]?pixel|spacer|placeholder|no[-_]?image|avatar[-_]?default)(?:[\/_.-]|$)/i;

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function localAssetPath(editionDir, imageUrl) {
  const relative = String(imageUrl || "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/");
  if (!relative.startsWith("assets/")) return null;
  const root = path.resolve(editionDir);
  const target = path.resolve(root, relative);
  return target.startsWith(`${root}${path.sep}`) ? target : null;
}

function titleTokens(article) {
  return wordTokens(
    article?.originalTitle || article?.headline || "",
    config.language,
    STOPWORDS,
  ).slice(0, 14);
}

function urlContextHits(article) {
  const haystack = normalizeText(
    `${article?.originalImageUrl || ""} ${article?.imageUrl || ""}`,
  );
  if (!haystack) return 0;
  return titleTokens(article).filter((token) => haystack.includes(token))
    .length;
}

async function imageSignals(article, editionDir) {
  if (!article?.imageUrl || article.displayImage === false) {
    return {
      hasImage: false,
      imageFitness: 0,
      imageDensity: null,
      imageAspect: null,
      imageContextHits: 0,
      imageRisk: "none",
    };
  }

  const width = Number(article.imageWidth || 0);
  const height = Number(article.imageHeight || 0);
  const aspect = width > 0 && height > 0 ? width / height : null;
  const asset = localAssetPath(editionDir, article.imageUrl);
  let bytes = null;
  if (asset) {
    try {
      bytes = (await fs.stat(asset)).size;
    } catch {}
  }
  const density =
    bytes && width > 0 && height > 0 ? bytes / (width * height) : null;
  const contextHits = urlContextHits(article);
  const urlText = `${article.originalImageUrl || ""} ${article.imageUrl || ""}`;
  const namedRisk = visualRiskPattern.test(urlText);

  let fitness = 0.68;
  const reasons = [];

  if (contextHits > 0) fitness += Math.min(0.18, contextHits * 0.08);
  if (article.imageRecovered) {
    fitness -= 0.08;
    reasons.push("recovered");
  }
  if (namedRisk) {
    fitness -= 0.48;
    reasons.push("profile-or-chrome-url");
  }
  // Portraits, wide crops and compact WebP/AVIF can all be real editorial
  // photos. Shape and byte density are diagnostics, not rejection criteria.
  if (aspect != null && aspect >= 1.28 && aspect <= 2.15) fitness += 0.08;

  fitness = clamp(fitness);
  return {
    hasImage: fitness >= 0.5,
    imageFitness: Number(fitness.toFixed(2)),
    imageDensity: density == null ? null : Number(density.toFixed(3)),
    imageAspect: aspect == null ? null : Number(aspect.toFixed(2)),
    imageContextHits: contextHits,
    imageRisk: reasons.join(",") || "none",
  };
}

async function annotateArticle(article, editionDir) {
  if (!article) return article;
  const visual = await imageSignals(article, editionDir);
  return {
    ...article,
    ...visual,
    displayImage: visual.hasImage,
  };
}

function storyPriority(article) {
  return Number(article?.sectionScore ?? article?.score ?? 0) || 0;
}

function defaultSectionPlan(section, annotated) {
  const stories = annotated.slice();
  const imageCount = stories.filter((article) => article.displayImage).length;
  if (stories.length <= 1) {
    return {
      layout: imageCount ? "solo-visual" : "solo-text",
      articleIds: stories.map((article) => Number(article.id)),
      featureId: stories[0] ? Number(stories[0].id) : null,
    };
  }

  const sorted = stories.slice().sort((a, b) => {
    const imageBonus =
      Number(Boolean(b.displayImage)) - Number(Boolean(a.displayImage));
    return (
      storyPriority(b) - storyPriority(a) ||
      imageBonus ||
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    );
  });
  const first = sorted[0];
  const second = sorted[1];
  const gap = storyPriority(first) - storyPriority(second);

  if (imageCount === 0) {
    return {
      layout: "text-grid",
      articleIds: stories.map((article) => Number(article.id)),
      featureId: gap >= 1.3 ? Number(first.id) : null,
    };
  }
  if (imageCount === 1) {
    const visual = stories.find((article) => article.displayImage);
    const rest = stories.filter((article) => article !== visual);
    return {
      layout: "mixed-grid",
      articleIds: [
        Number(visual.id),
        ...rest.map((article) => Number(article.id)),
      ],
      featureId: Number(visual.id),
    };
  }
  if (gap >= 1.25) {
    return {
      layout: "feature-grid",
      articleIds: [
        Number(first.id),
        ...stories
          .filter((article) => article.id !== first.id)
          .map((article) => Number(article.id)),
      ],
      featureId: Number(first.id),
    };
  }
  return {
    layout: "balanced-grid",
    articleIds: stories.map((article) => Number(article.id)),
    featureId: null,
  };
}

async function buildAnnotatedSections(edition, editionDir) {
  const sections = [];
  for (const section of edition.sections || []) {
    const articles = [];
    for (const article of section.articles || []) {
      articles.push(await annotateArticle(article, editionDir));
    }
    sections.push({ ...section, articles });
  }
  return sections;
}

function applyMaterializedPlan(section, plan) {
  const byId = new Map(
    section.articles.map((article) => [Number(article.id), article]),
  );
  const ordered = plan.articleIds
    .map((id) => byId.get(Number(id)))
    .filter(Boolean);
  const featureId = plan.featureId == null ? null : Number(plan.featureId);
  const articles = ordered.map((article, index) => {
    let displayRole = "standard";
    if (featureId != null && Number(article.id) === featureId)
      displayRole = "feature";
    else if (
      !article.displayImage &&
      (plan.layout === "briefs-grid" ||
        (plan.layout === "feature-grid" && index > 0) ||
        (plan.layout === "mixed-grid" && !article.displayImage))
    )
      displayRole = "brief";
    return { ...article, displayRole };
  });
  return {
    ...section,
    presentation: { layout: plan.layout, featureId },
    articles,
  };
}

export async function beforeRender(payload) {
  if (!payload?.edition) return payload;
  const sections = await buildAnnotatedSections(
    payload.edition,
    payload.editionDir,
  );
  const lead = await annotateArticle(payload.edition.lead, payload.editionDir);
  // Hierarchy follows score and image availability; it does not need another
  // model call after editorial selection and image validation.
  const mode = "deterministic";
  const planned = sections.map((section) =>
    applyMaterializedPlan(
      section,
      defaultSectionPlan(section, section.articles),
    ),
  );
  const stories = [
    lead,
    ...planned.flatMap((section) => section.articles || []),
  ].filter(Boolean);
  const suppressedImages = stories.filter(
    (article) => article.imageUrl && article.displayImage === false,
  ).length;

  return {
    ...payload,
    edition: {
      ...payload.edition,
      lead,
      sections: planned,
      stats: {
        ...(payload.edition.stats || {}),
        presentationMode: mode,
        suppressedImages,
      },
    },
  };
}
