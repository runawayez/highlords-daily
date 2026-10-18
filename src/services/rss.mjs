import { decision } from "../editorial/audit.mjs";
import { cleanSourceText, limitCopy } from "../editorial/source-text.mjs";
import { fetchFeedXml, recordFeedHealth } from "./feed-cache.mjs";
import { mapLimit } from "../utils/concurrency.mjs";
import { digest } from "../utils/storage.mjs";
import { filterPreviouslyPublished } from "./memory.mjs";
import { applyEditorialGuardrails } from "../editorial/routing.mjs";
import { count } from "../engine/metrics.mjs";
import { normalizeText } from "../utils/text.mjs";
import Parser from "rss-parser";
import { categories, config, feeds } from "../config.mjs";
import {
  canonicalImageKey,
  resolveBestArticleImage,
} from "./image-quality.mjs";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "HighlordsDaily/5.1 (+https://github.com/runawayez/highlords-daily)",
  },
  customFields: {
    item: [
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
    ],
  },
});

const categorySlugs = new Set(categories.map((category) => category.slug));

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function itemDate(item, now = new Date()) {
  const raw = item.isoDate || item.pubDate || item.published || item.updated;
  const parsed = raw ? new Date(raw) : null;
  if (parsed && Number.isFinite(parsed.getTime()))
    return { date: parsed, quality: "provided" };
  return {
    date: config.feedUnknownDate === "allow" ? now : null,
    quality: raw ? "invalid" : "missing",
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function imageCandidate(value, baseUrl) {
  if (!value) return null;
  const data = typeof value === "string" ? { url: value } : value;
  const attrs = data?.$ || data;
  const rawUrl = data?.url || attrs?.url || data?.href || attrs?.href;
  if (!rawUrl) return null;

  try {
    const url = new URL(String(rawUrl), baseUrl || undefined);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (/\/(?:embed|player)\//i.test(url.pathname)) return null;
    const width = Number(data?.width || attrs?.width || 0);
    const height = Number(data?.height || attrs?.height || 0);
    return {
      url: url.toString(),
      area: width > 0 && height > 0 ? width * height : 0,
    };
  } catch {
    return null;
  }
}

function htmlImages(html = "", baseUrl) {
  return [...String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => imageCandidate(match[1], baseUrl))
    .filter(Boolean);
}

function extractImage(item, baseUrl) {
  const candidates = [
    ...asArray(item.enclosure),
    ...asArray(item.mediaContent),
    ...asArray(item.mediaThumbnail),
    ...asArray(item.image),
    ...asArray(item.thumbnail),
  ]
    .map((value) => imageCandidate(value, baseUrl))
    .filter(Boolean);

  candidates.push(
    ...htmlImages(
      item["content:encoded"] ||
        item.content ||
        item.description ||
        item.summary ||
        "",
      baseUrl,
    ),
  );
  candidates.sort((a, b) => b.area - a.area);
  return candidates[0]?.url || null;
}

async function resolveArticleImage(article, imageMode) {
  if (imageMode === "off") return null;

  // Em modo `page`, priorize a imagem editorial da própria matéria, mas não
  // descarte um item só porque o HTML da página bloqueou/omitiu og:image.
  // Se a busca na página falhar, valide e use a imagem originalmente exposta
  // pelo RSS/Atom como fallback.
  if (imageMode === "page") {
    const pageImage = await resolveBestArticleImage(article, article.imageUrl, {
      forcePage: true,
    });
    if (pageImage) return pageImage;
    return resolveBestArticleImage(article, article.imageUrl, {
      forcePage: false,
    });
  }

  return resolveBestArticleImage(article, article.imageUrl, {
    forcePage: false,
  });
}

export async function fetchFeed(feed, { xml, now = new Date() } = {}) {
  const parsed = await parser.parseString(
    xml ?? (await fetchFeedXml(feed.url)),
  );
  const cutoff = now.getTime() - config.lookbackHours * 60 * 60 * 1000;
  const prepared = (parsed.items || [])
    .map((item, index) => {
      const published = itemDate(item, now);
      const link = item.link || item.guid;
      const excerpt = cleanSourceText(
        item["content:encoded"] ||
          item.content ||
          item.summary ||
          item.description ||
          item.contentSnippet ||
          "",
      );
      return {
        stableId: digest(
          `${feed.url}:${link || item.guid || item.id || index}`,
        ),
        id: `${feed.name}:${item.guid || item.id || link || index}`,
        language: feed.language || parsed.language || "und",
        publisherGroup: feed.publisherGroup || feed.name,
        reportingOrigin: feed.reportingOrigin || "",
        country: feed.country,
        coverage: feed.coverage,
        imageMode: feed.imageMode,
        source: feed.name || parsed.title || new URL(feed.url).hostname,
        focus: Array.isArray(feed.focus) ? feed.focus : [],
        strictFocus: Boolean(feed.strictFocus),
        originalTitle: stripHtml(item.title || "(untitled)"),
        link,
        publishedAt: published.date?.toISOString() || null,
        dateQuality: published.quality,
        excerpt: limitCopy(
          excerpt,
          1400,
          feed.language || parsed.language || "en",
        ),
        imageUrl:
          feed.imageMode === "off"
            ? null
            : extractImage(item, link || feed.url),
      };
    })
    .filter((article) => {
      const eligible =
        /^https?:\/\//i.test(String(article.link || "")) &&
        article.publishedAt &&
        new Date(article.publishedAt).getTime() >= cutoff &&
        new Date(article.publishedAt).getTime() <=
          now.getTime() + 15 * 60 * 1000;
      if (!eligible)
        decision(article, "collect", "invalid-link-or-date-outside-window");
      return eligible;
    })
    .map(applyEditorialGuardrails)
    .filter((article) => {
      if (article.editorialReject)
        decision(article, "guardrails", "editorial-rejected", {
          guardrail: article.editorialReject,
        });
      return !article.editorialReject;
    });

  return prepared
    .filter(
      (article) =>
        !config.sourceLanguages.length ||
        article.language === "und" ||
        config.sourceLanguages.some(
          (language) =>
            language.split("-")[0] ===
            String(article.language).toLowerCase().split("-")[0],
        ),
    )
    .sort(
      (a, b) =>
        new Date(b.publishedAt) - new Date(a.publishedAt) ||
        a.stableId.localeCompare(b.stableId),
    )
    .slice(0, config.maxItemsPerFeed);
}

function dedupe(articles) {
  const links = new Map();
  const titles = new Map();
  const unique = [];
  for (const article of articles) {
    const title = normalizeText(article.originalTitle);
    const existing = links.get(article.link) || (title && titles.get(title));
    if (existing) {
      (existing.relatedCoverage ||= []).push({
        link: article.link,
        source: article.source,
        publisherGroup: article.publisherGroup,
        reportingOrigin: article.reportingOrigin,
        excerpt: article.excerpt,
      });
      decision(article, "collect", "duplicate-link-or-title", {
        kept: existing.link,
      });
      continue;
    }
    unique.push(article);
    links.set(article.link, article);
    if (title) titles.set(title, article);
  }
  return unique;
}

function suppressRepeatedSourceImages(articles) {
  const counts = new Map();
  for (const article of articles) {
    if (!article.imageUrl) continue;
    const key = `${article.source}\n${canonicalImageKey(article.imageUrl)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return articles.map((article) => {
    if (!article.imageUrl) return article;
    const key = `${article.source}\n${canonicalImageKey(article.imageUrl)}`;
    if ((counts.get(key) || 0) < 2) return article;
    return {
      ...article,
      imageUrl: null,
      imageRejectedReason: "repeated-source-image",
    };
  });
}

// Rank within each publisher by recency, and round-robin publishers so multiple
// desks from the same newsroom cannot consume extra candidate quotas.
export function balancedLimit(articles, feedList, limit) {
  const weights = new Map(
    feedList.map((feed) => [feed.name, feed.weight || 1]),
  );
  const groups = new Map();
  const sorted = [...articles].sort(
    (a, b) =>
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0) ||
      (weights.get(b.source) || 1) - (weights.get(a.source) || 1) ||
      String(a.stableId).localeCompare(String(b.stableId)),
  );
  for (const article of sorted) {
    const key = article.publisherGroup || article.source;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(article);
  }
  const selected = [],
    selectedLinks = new Set(),
    covered = new Set();
  const add = (article) => {
    if (selected.length >= limit || selectedLinks.has(article.link))
      return false;
    selected.push(article);
    selectedLinks.add(article.link);
    return true;
  };
  // Give each configured source focus a first opportunity before extra slots.
  for (const category of categories) {
    const article = sorted.find(
      (item) =>
        !selectedLinks.has(item.link) &&
        item.focus?.includes(category.slug) &&
        !covered.has(item.publisherGroup || item.source),
    );
    if (article && add(article))
      covered.add(article.publisherGroup || article.source);
  }
  let progress = true;
  while (selected.length < limit && progress) {
    progress = false;
    for (const queue of groups.values()) {
      const article = queue.find((item) => !selectedLinks.has(item.link));
      if (article && add(article)) progress = true;
    }
  }
  return selected;
}

export async function resolveCandidateImages(
  articles,
  feedList,
  {
    limit = config.maxCandidates,
    resolve = (article) => resolveArticleImage(article, article.imageMode),
    concurrency = config.imageConcurrency,
    requireImages = config.requireImages,
  } = {},
) {
  const ordered = balancedLimit(articles, feedList, articles.length);
  const tested = [],
    eligible = [];
  // Only resolve the current deficit. Failed images trigger the next reserve
  // wave; successful candidates do not require probing the entire feed pool.
  let offset = 0;
  while (offset < ordered.length && eligible.length < limit) {
    const wave = ordered.slice(
      offset,
      offset + Math.max(1, limit - eligible.length),
    );
    offset += wave.length;
    const resolved = await mapLimit(wave, concurrency, async (article) => ({
      ...article,
      imageUrl: article.imageMode === "off" ? null : await resolve(article),
    }));
    tested.push(...resolved);
    const previousKeys = new Set(eligible.map((article) => article.stableId));
    eligible.splice(
      0,
      eligible.length,
      ...suppressRepeatedSourceImages(tested).filter(
        (article) =>
          !requireImages ||
          article.imageMode === "off" ||
          Boolean(article.imageUrl),
      ),
    );
    // Log decisions after all waves, since a repeated placeholder can invalidate an earlier candidate.
    if (previousKeys.size) count("imageReserveWaves");
  }
  count("imageCandidatesProbed", tested.length);
  count("imageCandidatesDeferred", ordered.length - offset);
  const keys = new Set(eligible.map((article) => article.stableId));
  for (const article of tested)
    if (!keys.has(article.stableId))
      decision(article, "images", "no-valid-editorial-image");
  for (const article of ordered.slice(offset))
    decision(article, "collect", "candidate-limit-before-image-probe");
  return {
    articles: eligible.slice(0, limit),
    imageRejected: tested.length - eligible.length,
  };
}

export async function fetchAllFeeds(
  onProgress = () => {},
  feedList = feeds,
  { excludeEditionDate = null } = {},
) {
  const outcomes = await mapLimit(
    feedList,
    config.feedConcurrency,
    async (feed, index) => {
      const start = performance.now();
      let items = [],
        error = null;
      try {
        items = await fetchFeed(feed);
      } catch (failure) {
        error = failure.message || String(failure);
      }
      const elapsedMs = performance.now() - start;
      await recordFeedHealth(feed.url, {
        error,
        elapsedMs,
        items: items.length,
      });
      onProgress({
        index: index + 1,
        total: feedList.length,
        feed: feed.name,
        elapsedMs,
        error,
      });
      return { items, error: error ? `${feed.name}: ${error}` : null };
    },
  );
  const unique = dedupe(outcomes.flatMap((outcome) => outcome.items));
  // Historical rejection happens before any image/page network requests.
  const historical = await filterPreviouslyPublished(
    unique,
    config.duplicateThreshold,
    { excludeEditionDate },
  );
  const resolved = config.requireImages
    ? await resolveCandidateImages(historical.articles, feedList)
    : {
        articles: balancedLimit(
          historical.articles,
          feedList,
          config.maxCandidates,
        ),
        imageRejected: 0,
      };
  const selected = resolved.articles;
  const selectedKeys = new Set(selected.map((article) => article.stableId));
  for (const article of selected)
    decision(
      article,
      "collect",
      selectedKeys.has(article.stableId)
        ? "candidate-selected"
        : "candidate-limit",
    );
  selected.forEach((article, index) => {
    article.id = index + 1;
  });
  return {
    articles: selected,
    errors: outcomes.map((outcome) => outcome.error).filter(Boolean),
    historyRejected: historical.rejected.length,
    imageRejected: resolved.imageRejected,
  };
}
