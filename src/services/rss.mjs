import { fetchFeedXml, recordFeedHealth } from "./feed-cache.mjs";
import { mapLimit } from "../utils/concurrency.mjs";
import { digest } from "../utils/storage.mjs";
import { filterPreviouslyPublished } from "./memory.mjs";
import { applyEditorialGuardrails } from "../editorial/routing.mjs";
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
      "HighlordsDaily/4.0 (+https://github.com/runawayez/highlords-daily)",
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

function itemDate(item) {
  const raw = item.isoDate || item.pubDate || item.published || item.updated;
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
      item.content || item.description || item.summary || "",
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

export async function fetchFeed(feed) {
  const parsed = await parser.parseString(await fetchFeedXml(feed.url));
  const cutoff = Date.now() - config.lookbackHours * 60 * 60 * 1000;
  const prepared = (parsed.items || [])
    .slice(0, config.maxItemsPerFeed)
    .map((item, index) => {
      const published = itemDate(item);
      const link = item.link || item.guid;
      const excerpt = stripHtml(
        item.contentSnippet ||
          item.content ||
          item.summary ||
          item.description ||
          "",
      );
      return {
        stableId: digest(
          `${feed.url}:${link || item.guid || item.id || index}`,
        ),
        id: `${feed.name}:${item.guid || item.id || link || index}`,
        language: feed.language || parsed.language || "und",
        publisherGroup: feed.publisherGroup || feed.name,
        country: feed.country,
        coverage: feed.coverage,
        imageMode: feed.imageMode,
        source: feed.name || parsed.title || new URL(feed.url).hostname,
        focus: Array.isArray(feed.focus) ? feed.focus : [],
        strictFocus: Boolean(feed.strictFocus),
        originalTitle: stripHtml(item.title || "(untitled)"),
        link,
        publishedAt: published.toISOString(),
        excerpt: excerpt.slice(0, 1400),
        imageUrl:
          feed.imageMode === "off"
            ? null
            : extractImage(item, link || feed.url),
      };
    })
    .filter(
      (article) =>
        /^https?:\/\//i.test(String(article.link || "")) &&
        new Date(article.publishedAt).getTime() >= cutoff,
    )
    .map(applyEditorialGuardrails)
    .filter((article) => !article.editorialReject);

  return prepared.filter(
    (article) =>
      !config.sourceLanguages.length ||
      article.language === "und" ||
      config.sourceLanguages.some(
        (language) =>
          language.split("-")[0] === String(article.language).split("-")[0],
      ),
  );
}

function dedupe(articles) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  return articles.filter((article) => {
    const titleKey = normalizeText(article.originalTitle);
    if (seenLinks.has(article.link) || (titleKey && seenTitles.has(titleKey)))
      return false;
    seenLinks.add(article.link);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });
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

function balancedLimit(articles, feedList, limit) {
  if (articles.length <= limit) {
    return [...articles].sort(
      (a, b) =>
        new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0) ||
        String(a.stableId).localeCompare(String(b.stableId)),
    );
  }

  const quota = Math.max(1, Math.floor(limit / Math.max(1, feedList.length)));
  const selected = [];
  const selectedLinks = new Set();

  for (const feed of feedList) {
    const fromFeed = articles
      .filter((article) => article.source === feed.name)
      .sort(
        (a, b) =>
          new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0) ||
          String(a.stableId).localeCompare(String(b.stableId)),
      )
      .slice(0, quota);

    for (const article of fromFeed) {
      if (selected.length >= limit) break;
      selected.push(article);
      selectedLinks.add(article.link);
    }
  }

  const remaining = articles
    .filter((article) => !selectedLinks.has(article.link))
    .sort(
      (a, b) =>
        new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0) ||
        String(a.stableId).localeCompare(String(b.stableId)),
    );

  for (const article of remaining) {
    if (selected.length >= limit) break;
    selected.push(article);
  }

  return selected.sort(
    (a, b) =>
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0) ||
      String(a.stableId).localeCompare(String(b.stableId)),
  );
}

export async function fetchAllFeeds(onProgress = () => {}, feedList = feeds) {
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
  const historical = await filterPreviouslyPublished(unique);
  const enriched = await mapLimit(
    historical.articles,
    config.imageConcurrency,
    async (article) => ({
      ...article,
      imageUrl:
        article.imageMode === "off"
          ? null
          : await resolveArticleImage(article, article.imageMode),
    }),
  );
  const eligible = suppressRepeatedSourceImages(enriched);
  const withImages = config.requireImages
    ? eligible.filter((article) => article.imageUrl)
    : eligible;
  const selected = balancedLimit(withImages, feedList, config.maxCandidates);
  selected.forEach((article, index) => {
    article.id = index + 1;
  });
  return {
    articles: selected,
    errors: outcomes.map((outcome) => outcome.error).filter(Boolean),
    historyRejected: historical.rejected.length,
    imageRejected: eligible.length - withImages.length,
  };
}
