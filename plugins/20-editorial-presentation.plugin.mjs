import fs from "node:fs/promises";
import path from "node:path";
import { config, publication } from "../src/config.mjs";
import { requestChat } from "../src/services/ollama-client.mjs";
import { DiskCache, digest } from "../src/utils/storage.mjs";
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
  /(?:author|autor|avatar|profile|perfil|headshot|speaker|palestrante|bio(?:graphy|grafia)?|logo|brand|marca|banner|card|quote|citation|citacao)/i;
const cache = new DiskCache(config.cacheDir);

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
  if (aspect != null) {
    if (aspect < 1.05) {
      fitness -= 0.28;
      reasons.push("portrait-like");
    } else if (aspect > 2.55) {
      fitness -= 0.24;
      reasons.push("banner-like");
    } else if (aspect >= 1.28 && aspect <= 2.15) {
      fitness += 0.08;
    }
  }
  if (density != null) {
    if (density < 0.035) {
      fitness -= 0.5;
      reasons.push("very-low-density");
    } else if (density < 0.065) {
      fitness -= 0.3;
      reasons.push("low-density");
    } else if (density < 0.1) {
      fitness -= 0.13;
      reasons.push("graphic-like-density");
    } else if (density >= 0.16) {
      fitness += 0.07;
    }
  }

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

function normalizeRequestedPlan(section, annotated, requested) {
  const ids = new Set(annotated.map((article) => Number(article.id)));
  const requestedIds = Array.isArray(requested?.articleIds)
    ? requested.articleIds.map(Number).filter((id) => ids.has(id))
    : [];
  if (
    requestedIds.length !== ids.size ||
    new Set(requestedIds).size !== ids.size
  )
    return defaultSectionPlan(section, annotated);

  const byId = new Map(
    annotated.map((article) => [Number(article.id), article]),
  );
  const ordered = requestedIds.map((id) => byId.get(id)).filter(Boolean);
  const imageCount = ordered.filter((article) => article.displayImage).length;
  const rawFeatureId = requested?.featureId;
  const featureId =
    rawFeatureId != null && ids.has(Number(rawFeatureId))
      ? Number(rawFeatureId)
      : null;
  const requestedLayout = ["feature", "balanced", "briefs"].includes(
    requested?.layout,
  )
    ? requested.layout
    : "balanced";

  if (ordered.length <= 1) {
    return {
      layout: imageCount ? "solo-visual" : "solo-text",
      articleIds: requestedIds,
      featureId: ordered[0] ? Number(ordered[0].id) : null,
    };
  }
  if (imageCount === 0) {
    return {
      layout: requestedLayout === "briefs" ? "briefs-grid" : "text-grid",
      articleIds: requestedIds,
      featureId,
    };
  }
  if (requestedLayout === "briefs") {
    return { layout: "briefs-grid", articleIds: requestedIds, featureId: null };
  }
  if (imageCount === 1) {
    return {
      layout: "mixed-grid",
      articleIds: requestedIds,
      featureId:
        featureId ||
        Number(ordered.find((article) => article.displayImage)?.id),
    };
  }
  return {
    layout: requestedLayout === "feature" ? "feature-grid" : "balanced-grid",
    articleIds: requestedIds,
    featureId:
      requestedLayout === "feature" ? featureId || requestedIds[0] : featureId,
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

function compactForEditor(sections) {
  return sections.map((section) => ({
    slug: section.slug,
    name: section.name,
    stories: section.articles.map((article) => ({
      id: Number(article.id),
      headline: article.headline || article.originalTitle,
      summary: String(article.summary || article.excerpt || "").slice(0, 260),
      source: article.source,
      sectionPriority: storyPriority(article),
      frontPagePriority:
        Number(article.frontPageScore ?? article.score ?? 0) || 0,
      hasImage: Boolean(article.displayImage),
      imageFitness: article.imageFitness,
      imageRisk: article.imageRisk,
      headlineLength: String(article.headline || article.originalTitle || "")
        .length,
    })),
  }));
}

async function requestPresentationPlan(sections, editionDate) {
  const compact = compactForEditor(sections);
  const allIds = compact.flatMap((section) =>
    section.stories.map((story) => story.id),
  );
  const schema = {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slug: { type: "string" },
            layout: {
              type: "string",
              enum: ["feature", "balanced", "briefs"],
            },
            articleIds: {
              type: "array",
              uniqueItems: true,
              items: { type: "integer", enum: allIds },
            },
            featureId: { type: "integer", enum: allIds },
          },
          required: ["slug", "layout", "articleIds"],
          additionalProperties: false,
        },
      },
    },
    required: ["sections"],
    additionalProperties: false,
  };

  const key = digest(
    JSON.stringify({ editionDate, compact, language: config.language }),
  );
  return cache.remember(
    "editorial-presentation",
    key,
    () =>
      requestChat(
        `Você é o editor de arte do ${publication.name}. Sua função é definir HIERARQUIA EDITORIAL, não escrever HTML ou CSS.
A composição final será feita por templates determinísticos de jornal.

Para cada seção:
- preserve todas as matérias da seção; não adicione, remova ou mova matéria para outra categoria;
- reordene articleIds apenas quando isso melhorar a leitura;
- use layout "feature" quando uma matéria merece dominar visualmente a seção;
- use "balanced" quando as matérias têm peso semelhante;
- use "briefs" quando a seção funciona melhor como notas compactas, especialmente quando faltam boas imagens;
- matéria com hasImage=false deve ser tratada como matéria tipográfica, nunca como um buraco visual;
- imageFitness abaixo de 0.55 indica visual fraco: evite escolher essa matéria como feature por causa da imagem;
- prefira uma boa imagem + uma nota tipográfica a dois cards visualmente desequilibrados;
- textos longos e manchetes longas pedem mais espaço horizontal;
- featureId é opcional e, quando usado, deve pertencer à própria seção;
- não altere a ordem das seções;
- devolva somente JSON válido.`,
        JSON.stringify({ editionDate, sections: compact }),
        { timeoutMs: 150000, schema },
      ),
    6 * 60 * 60 * 1000,
  );
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
      plan.layout === "briefs-grid" ||
      (plan.layout === "feature-grid" && index > 0) ||
      (plan.layout === "mixed-grid" && !article.displayImage)
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

function applyPlans(sections, response) {
  const requestedBySlug = new Map(
    (response?.sections || []).map((section) => [section.slug, section]),
  );
  return sections.map((section) =>
    applyMaterializedPlan(
      section,
      normalizeRequestedPlan(
        section,
        section.articles,
        requestedBySlug.get(section.slug),
      ),
    ),
  );
}

export async function beforeRender(payload) {
  if (!payload?.edition) return payload;
  const sections = await buildAnnotatedSections(
    payload.edition,
    payload.editionDir,
  );
  const lead = await annotateArticle(payload.edition.lead, payload.editionDir);
  let response = null;
  let mode = "deterministic-fallback";
  try {
    response = await requestPresentationPlan(
      sections,
      payload.edition.editionDate,
    );
    mode = "ollama-art-director";
  } catch (error) {
    console.warn(`  Editor visual fallback: ${error.message || error}`);
  }

  const planned = response
    ? applyPlans(sections, response)
    : sections.map((section) =>
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
