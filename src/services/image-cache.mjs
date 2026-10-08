import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.mjs";
import {
  canonicalImageKey,
  discoverPageImageCandidates,
  fetchValidatedImageBuffer,
  resolveBestArticleImage,
} from "./image-quality.mjs";

function extensionFor(contentType = "") {
  const type = String(contentType).split(";")[0].trim().toLowerCase();
  const map = new Map([
    ["image/jpeg", "jpg"],
    ["image/jpg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/avif", "avif"],
    ["image/gif", "gif"],
  ]);
  return map.get(type) || null;
}

function articleKey(article) {
  return String(article?.id ?? article?.link ?? "");
}

function topicKey(article) {
  return String(article?.topicKey || "")
    .trim()
    .toLowerCase();
}

function isPreparedValid(article) {
  if (!article) return false;
  // `images: false` is explicit source policy, not an image failure. Those
  // stories are allowed to render as deterministic text cards.
  if (article.imageMode === "off" || article.textOnly === true) return true;
  return config.cacheImages
    ? article.imageCached === true
    : article.imageValidated === true;
}

function sourceAllowed(article, globalCounts, sectionCounts, relaxed = false) {
  if (relaxed) return true;
  const global =
    globalCounts.get(article.publisherGroup || article.source) || 0;
  const section =
    sectionCounts?.get(article.publisherGroup || article.source) || 0;
  if (config.maxItemsPerSource > 0 && global >= config.maxItemsPerSource)
    return false;
  if (
    sectionCounts &&
    config.maxItemsPerSourcePerSection > 0 &&
    section >= config.maxItemsPerSourcePerSection
  )
    return false;
  return true;
}

function registerArticle(
  article,
  usedIds,
  usedTopics,
  globalCounts,
  sectionCounts = null,
) {
  usedIds.add(articleKey(article));
  const topic = topicKey(article);
  if (topic) usedTopics.add(topic);
  globalCounts.set(
    article.publisherGroup || article.source,
    (globalCounts.get(article.publisherGroup || article.source) || 0) + 1,
  );
  if (sectionCounts)
    sectionCounts.set(
      article.publisherGroup || article.source,
      (sectionCounts.get(article.publisherGroup || article.source) || 0) + 1,
    );
}

function uniqueArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    if (!article) return false;
    const key = articleKey(article);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function candidateImageUrls(article) {
  // Never rediscover an Open Graph/preview image for a source that explicitly
  // opted out of images (copyright, quality or editorial reasons).
  if (article?.imageMode === "off" || article?.textOnly === true) return [];

  const urls = [];
  if (article?.imageUrl && /^https?:\/\//i.test(article.imageUrl))
    urls.push(article.imageUrl);
  const page = article.imageUrl
    ? []
    : await discoverPageImageCandidates(article);
  for (const candidate of page) urls.push(candidate.url);
  const unique = new Map();
  for (const url of urls) {
    const key = canonicalImageKey(url);
    if (key && !unique.has(key)) unique.set(key, url);
  }
  return [...unique.values()];
}

async function cacheRemoteImage(article, assetsDir) {
  const originalImageUrl = article?.imageUrl || null;
  const urls = await candidateImageUrls(article);
  let lastError = originalImageUrl
    ? "imagem rejeitada na validação final"
    : "matéria sem imagem candidata";

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const fetched = await fetchValidatedImageBuffer(url);
    if (!fetched.ok || !fetched.buffer) {
      lastError = fetched.reason || lastError;
      if (index === urls.length - 1 && originalImageUrl) {
        const page = await discoverPageImageCandidates(article);
        for (const candidate of page)
          if (!urls.includes(candidate.url)) urls.push(candidate.url);
      }
      continue;
    }

    const extension = extensionFor(fetched.type);
    if (!extension) {
      lastError = "formato de imagem não suportado";
      continue;
    }

    const hash = crypto
      .createHash("sha1")
      .update(fetched.url || url)
      .digest("hex")
      .slice(0, 10);
    const filename = `story-${articleKey(article).replace(/[^a-z0-9_-]/gi, "-")}-${hash}.${extension}`;
    const target = path.join(assetsDir, filename);
    try {
      await fs.writeFile(target, fetched.buffer);
    } catch (error) {
      lastError = error.message || String(error);
      continue;
    }

    return {
      ...article,
      originalImageUrl,
      imageUrl: `assets/${filename}`,
      imageCached: true,
      imageValidated: true,
      imageRecovered:
        index > 0 ||
        (originalImageUrl &&
          canonicalImageKey(originalImageUrl) !==
            canonicalImageKey(fetched.url || url)),
      imageWidth: fetched.width || null,
      imageHeight: fetched.height || null,
    };
  }

  return {
    ...article,
    originalImageUrl,
    imageUrl: config.requireImages ? null : originalImageUrl,
    imageCached: false,
    imageValidated: false,
    imageCacheError: lastError,
  };
}

async function validateRemoteOnly(article) {
  const resolved = await resolveBestArticleImage(
    article,
    article?.imageUrl || null,
  );
  if (resolved) {
    return {
      ...article,
      originalImageUrl: article?.imageUrl || null,
      imageUrl: resolved,
      imageValidated: true,
      imageCached: false,
    };
  }
  return {
    ...article,
    originalImageUrl: article?.imageUrl || null,
    imageUrl: config.requireImages ? null : article?.imageUrl || null,
    imageValidated: false,
    imageCached: false,
    imageCacheError: "nenhuma imagem editorial válida encontrada",
  };
}

async function prepareArticle(article, assetsDir) {
  if (!article) return null;
  if (article.imageMode === "off") {
    return {
      ...article,
      imageUrl: null,
      originalImageUrl: article.imageUrl || null,
      imageCached: false,
      imageValidated: false,
      textOnly: true,
    };
  }
  return config.cacheImages
    ? cacheRemoteImage(article, assetsDir)
    : validateRemoteOnly(article);
}

async function prepareInitialArticles(edition, assetsDir) {
  const unique = new Map();
  for (const article of [
    edition.lead,
    ...edition.sections.flatMap((section) => section.articles || []),
  ].filter(Boolean)) {
    if (!unique.has(articleKey(article)))
      unique.set(articleKey(article), article);
  }

  const entries = [...unique.values()];
  const prepared = new Map();
  let cursor = 0;
  const workers = Math.min(config.imageConcurrency, entries.length);
  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      const article = entries[index];
      prepared.set(
        articleKey(article),
        await prepareArticle(article, assetsDir),
      );
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return prepared;
}

function rankedReserves(context) {
  const candidates = Array.isArray(context.reserveCandidates)
    ? context.reserveCandidates
    : [];
  return [...candidates].sort((a, b) => {
    const score = Number(b.score || 0) - Number(a.score || 0);
    return score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });
}

function reconcileTopStories(topStories, sections, lead) {
  const sectionArticles = sections.flatMap((section) => section.articles || []);
  const available = new Map(
    sectionArticles.map((article) => [articleKey(article), article]),
  );
  const target = Math.min(topStories.length, sectionArticles.length, 5);
  const selected = [];
  const seen = new Set();
  const seenTopics = new Set();
  const leadKey = articleKey(lead);

  const tryAdd = (article) => {
    if (!article) return false;
    const key = articleKey(article);
    const topic = topicKey(article);
    if (
      !key ||
      key === leadKey ||
      seen.has(key) ||
      (topic && seenTopics.has(topic))
    )
      return false;
    selected.push(article);
    seen.add(key);
    if (topic) seenTopics.add(topic);
    return true;
  };

  for (const original of topStories)
    tryAdd(available.get(articleKey(original)));
  for (const article of sectionArticles.slice().sort((a, b) => {
    const score =
      Number(b.frontPageScore ?? b.score ?? 0) -
      Number(a.frontPageScore ?? a.score ?? 0);
    return score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  })) {
    if (selected.length >= target) break;
    tryAdd(article);
  }
  return selected.slice(0, target);
}

async function enforceRequiredImages(
  edition,
  assetsDir,
  preparedById,
  context,
) {
  const reserves = rankedReserves(context);
  // These sets track section occupancy only. The lead and highlight block are
  // presentations of stories, not extra editorial slots, so they must not
  // evict the same story from its configured category.
  const usedIds = new Set();
  const usedTopics = new Set();
  const failedIds = new Set();
  const globalCounts = new Map();
  const topStories = Array.isArray(edition.topStories)
    ? edition.topStories.filter(Boolean)
    : [];
  let replacements = 0;
  let removed = 0;
  let diversityRelaxed = 0;
  let reserveFailures = 0;

  const preparedFor = async (article) => {
    const key = articleKey(article);
    if (preparedById.has(key)) return preparedById.get(key);
    const prepared = await prepareArticle(article, assetsDir);
    preparedById.set(key, prepared);
    if (!isPreparedValid(prepared)) {
      failedIds.add(key);
      reserveFailures += 1;
    }
    return prepared;
  };

  const usable = (article) => {
    if (!article || !isPreparedValid(article)) return false;
    const key = articleKey(article);
    if (usedIds.has(key)) return false;
    const topic = topicKey(article);
    if (topic && usedTopics.has(topic)) return false;
    return true;
  };

  const findReplacement = async (
    category,
    sectionCounts = null,
    allowAnyCategory = false,
  ) => {
    const passes = config.sourceDiversityStrict ? [false] : [false, true];
    for (const relaxed of passes) {
      for (const candidate of reserves) {
        const key = articleKey(candidate);
        if (!key || usedIds.has(key) || failedIds.has(key)) continue;
        if (!allowAnyCategory && category && candidate.category !== category)
          continue;
        const topic = topicKey(candidate);
        if (topic && usedTopics.has(topic)) continue;
        if (!sourceAllowed(candidate, globalCounts, sectionCounts, relaxed))
          continue;

        const prepared = await preparedFor(candidate);
        if (!usable(prepared)) continue;
        if (relaxed) diversityRelaxed += 1;
        return prepared;
      }
    }
    return null;
  };

  let lead = await preparedFor(edition.lead);
  if (!isPreparedValid(lead)) {
    failedIds.add(articleKey(edition.lead));
    lead =
      (await findReplacement(edition.lead?.category || null, null, false)) ||
      (await findReplacement(null, null, true));
    if (!lead) {
      throw new Error(
        "REQUIRE_IMAGES=true: nenhuma matéria visual válida ou fonte textual permitida pôde assumir a manchete.",
      );
    }
    replacements += 1;
  }

  const sections = [];
  for (const section of edition.sections || []) {
    const sectionCounts = new Map();
    const articles = [];
    for (const original of section.articles || []) {
      let prepared = await preparedFor(original);
      if (!usable(prepared)) {
        failedIds.add(articleKey(original));
        prepared = await findReplacement(section.slug, sectionCounts, false);
        if (prepared) replacements += 1;
      }

      if (!prepared || !usable(prepared)) {
        removed += 1;
        continue;
      }

      registerArticle(
        prepared,
        usedIds,
        usedTopics,
        globalCounts,
        sectionCounts,
      );
      articles.push(prepared);
    }
    sections.push({ ...section, articles });
  }

  const reconciledTopStories = reconcileTopStories(topStories, sections, lead);
  const finalStories = uniqueArticles([
    lead,
    ...reconciledTopStories,
    ...sections.flatMap((section) => section.articles || []),
  ]);
  const cached = new Set(
    finalStories.filter((article) => article.imageCached).map(articleKey),
  ).size;
  const validatedRemote = new Set(
    finalStories
      .filter((article) => article.imageValidated && !article.imageCached)
      .map(articleKey),
  ).size;

  if (replacements)
    console.log(
      `  ${replacements} matéria(s) substituída(s) por reserva após falha/rejeição de imagem.`,
    );
  if (removed)
    console.log(
      `  ${removed} vaga(s) removida(s): não havia reserva da mesma categoria com imagem válida.`,
    );
  if (reserveFailures)
    console.log(
      `  ${reserveFailures} candidata(s) de reserva também falharam na validação de imagem.`,
    );

  return {
    edition: {
      ...edition,
      lead,
      topStories: reconciledTopStories,
      sections,
      sectionOrder: sections
        .filter((section) => section.articles?.length)
        .map((section) => section.slug),
      stats: {
        ...(edition.stats || {}),
        stories: finalStories.length,
        sources: new Set(
          finalStories.map(
            (article) => article.publisherGroup || article.source,
          ),
        ).size,
        topStories: reconciledTopStories.length,
        visibleSections: sections.filter((section) => section.articles?.length)
          .length,
        imageHardRule: true,
        imageReplacements: replacements,
        imageRemoved: removed,
        imageReserveFailures: reserveFailures,
        imageDiversityRelaxed: diversityRelaxed,
      },
    },
    cached,
    validatedRemote,
    replacements,
    removed,
    reserveFailures,
  };
}

export async function cacheEditionImages(edition, editionDir, context = {}) {
  if (!edition) return { edition, cached: 0, failed: 0 };
  const assetsDir = path.join(editionDir, "assets");
  if (config.cacheImages) await fs.mkdir(assetsDir, { recursive: true });

  const preparedById = await prepareInitialArticles(edition, assetsDir);

  if (config.requireImages) {
    const strict = await enforceRequiredImages(
      edition,
      assetsDir,
      preparedById,
      context,
    );
    return {
      edition: strict.edition,
      cached: strict.cached,
      failed: 0,
      validatedRemote: strict.validatedRemote,
      replaced: strict.replacements,
      removed: strict.removed,
    };
  }

  const replace = (article) =>
    article ? preparedById.get(articleKey(article)) || article : article;
  const nextEdition = {
    ...edition,
    lead: replace(edition.lead),
    topStories: (edition.topStories || []).map(replace),
    sections: edition.sections.map((section) => ({
      ...section,
      articles: (section.articles || []).map(replace),
    })),
  };

  let cached = 0;
  let failed = 0;
  for (const article of preparedById.values()) {
    if (article.imageCached) cached += 1;
    else if (
      article.imageMode !== "off" &&
      (article.originalImageUrl || article.imageUrl)
    )
      failed += 1;
  }
  return { edition: nextEdition, cached, failed };
}
