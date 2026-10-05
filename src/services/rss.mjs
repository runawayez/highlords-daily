import Parser from 'rss-parser';
import { config, feeds } from '../config.mjs';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'HighlordsDaily/2.0 (+https://github.com/runawayez/highlords-daily)'
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail']
    ]
  }
});

function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
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
  const data = typeof value === 'string' ? { url: value } : value;
  const attrs = data?.$ || data;
  const rawUrl = data?.url || attrs?.url || data?.href || attrs?.href;
  if (!rawUrl) return null;

  try {
    const url = new URL(String(rawUrl), baseUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const width = Number(data?.width || attrs?.width || 0);
    const height = Number(data?.height || attrs?.height || 0);
    return { url: url.toString(), area: width > 0 && height > 0 ? width * height : 0 };
  } catch {
    return null;
  }
}

function htmlImages(html = '', baseUrl) {
  return [...String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map(match => imageCandidate(match[1], baseUrl))
    .filter(Boolean);
}

function extractImage(item, baseUrl) {
  const candidates = [
    ...asArray(item.enclosure),
    ...asArray(item.mediaContent),
    ...asArray(item.mediaThumbnail),
    ...asArray(item.image),
    ...asArray(item.thumbnail)
  ].map(value => imageCandidate(value, baseUrl)).filter(Boolean);

  candidates.push(...htmlImages(item.content || item.description || item.summary || '', baseUrl));
  candidates.sort((a, b) => b.area - a.area);
  return candidates[0]?.url || null;
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

async function fetchPageImage(link) {
  if (!link) return null;
  try {
    const response = await fetch(link, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 HighlordsDaily/2.0',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return null;
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return null;
    const html = (await response.text()).slice(0, 350_000);
    const raw = metaContent(html, 'og:image:secure_url')
      || metaContent(html, 'og:image')
      || metaContent(html, 'twitter:image')
      || metaContent(html, 'twitter:image:src');
    return imageCandidate(raw, response.url || link)?.url || null;
  } catch {
    return null;
  }
}

async function enrichImages(articles) {
  let cursor = 0;
  const workers = Math.min(4, articles.length);
  async function worker() {
    while (cursor < articles.length) {
      const index = cursor++;
      if (!articles[index].imageUrl) articles[index].imageUrl = await fetchPageImage(articles[index].link);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return articles;
}

async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const cutoff = Date.now() - config.lookbackHours * 60 * 60 * 1000;
  const articles = (parsed.items || [])
    .slice(0, config.maxItemsPerFeed)
    .map((item, index) => {
      const published = itemDate(item);
      const link = item.link || item.guid;
      const excerpt = stripHtml(item.contentSnippet || item.content || item.summary || item.description || '');
      return {
        id: `${feed.name}:${item.guid || item.id || link || index}`,
        source: feed.name || parsed.title || new URL(feed.url).hostname,
        originalTitle: stripHtml(item.title || 'Sem título'),
        link,
        publishedAt: published.toISOString(),
        excerpt: excerpt.slice(0, 1200),
        imageUrl: extractImage(item, link || feed.url)
      };
    })
    .filter(article => article.link && new Date(article.publishedAt).getTime() >= cutoff);

  return enrichImages(articles);
}

function dedupe(articles) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  return articles.filter(article => {
    const titleKey = article.originalTitle.toLocaleLowerCase('pt-BR').replace(/\W+/g, ' ').trim();
    if (seenLinks.has(article.link) || (titleKey && seenTitles.has(titleKey))) return false;
    seenLinks.add(article.link);
    if (titleKey) seenTitles.add(titleKey);
    return true;
  });
}

export async function fetchAllFeeds(onProgress = () => {}) {
  const articles = [];
  const errors = [];

  for (let index = 0; index < feeds.length; index += 1) {
    const feed = feeds[index];
    onProgress({ index: index + 1, total: feeds.length, feed: feed.name });
    try {
      articles.push(...await fetchFeed(feed));
    } catch (error) {
      errors.push(`${feed.name}: ${error.message || String(error)}`);
    }
  }

  const unique = dedupe(articles)
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, config.maxCandidates);

  unique.forEach((article, index) => { article.id = index + 1; });
  return { articles: unique, errors };
}
