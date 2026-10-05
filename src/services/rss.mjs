import Parser from 'rss-parser';
import { config } from '../config.mjs';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'HighlordsPost/0.4 (+https://github.com/runawayez/highlords-post)'
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
    const type = String(data?.type || attrs?.type || '').toLowerCase();
    return { url: url.toString(), width, height, type };
  } catch {
    return null;
  }
}

function imageScore(candidate) {
  if (!candidate) return -1;
  const area = candidate.width > 0 && candidate.height > 0 ? candidate.width * candidate.height : 0;
  const imageTypeBonus = candidate.type.startsWith('image/') ? 1_000_000 : 0;
  return imageTypeBonus + area;
}

function htmlImages(html = '', baseUrl) {
  const matches = [...String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
  return matches.map(match => imageCandidate(match[1], baseUrl)).filter(Boolean);
}

function extractImage(item, baseUrl) {
  const enclosureCandidates = asArray(item.enclosure)
    .map(value => imageCandidate(value, baseUrl))
    .filter(candidate => candidate && (!candidate.type || candidate.type.startsWith('image/')));

  const mediaCandidates = [
    ...asArray(item.mediaContent),
    ...asArray(item.mediaThumbnail),
    ...asArray(item.image),
    ...asArray(item.thumbnail)
  ].map(value => imageCandidate(value, baseUrl)).filter(Boolean);

  const embeddedCandidates = htmlImages(item.content || item.description || item.summary || '', baseUrl);
  const candidates = [...enclosureCandidates, ...mediaCandidates, ...embeddedCandidates];
  if (!candidates.length) return null;

  candidates.sort((a, b) => imageScore(b) - imageScore(a));
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
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HighlordsPost/0.4',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null;

    const html = (await response.text()).slice(0, 400_000);
    const raw = metaContent(html, 'og:image:secure_url')
      || metaContent(html, 'og:image')
      || metaContent(html, 'twitter:image')
      || metaContent(html, 'twitter:image:src');
    return imageCandidate(raw, response.url || link)?.url || null;
  } catch {
    return null;
  }
}

async function enrichMissingImages(articles, concurrency = 4) {
  let cursor = 0;
  const workers = Math.min(concurrency, articles.length);

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= articles.length) return;
      const article = articles[index];
      if (article.imageUrl) continue;
      article.imageUrl = await fetchPageImage(article.link);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return articles;
}

export async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const cutoff = Date.now() - config.lookbackHours * 60 * 60 * 1000;

  const articles = (parsed.items || [])
    .slice(0, Math.max(1, config.maxItemsPerFeed))
    .map(item => {
      const published = itemDate(item);
      const link = item.link || item.guid;
      const excerpt = stripHtml(item.contentSnippet || item.content || item.summary || item.description || '');
      return {
        externalId: item.guid || item.id || link,
        source: feed.name || parsed.title || new URL(feed.url).hostname,
        originalTitle: stripHtml(item.title || 'Sem título'),
        link,
        publishedAt: published.toISOString(),
        excerpt: excerpt.slice(0, 1800),
        imageUrl: extractImage(item, link || feed.url)
      };
    })
    .filter(item => item.link && new Date(item.publishedAt).getTime() >= cutoff);

  return enrichMissingImages(articles);
}
