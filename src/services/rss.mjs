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

function imageCandidate(value) {
  if (!value) return null;
  const data = typeof value === 'string' ? { url: value } : value;
  const attrs = data?.$ || data;
  const rawUrl = data?.url || attrs?.url || data?.href || attrs?.href;
  if (!rawUrl) return null;

  try {
    const url = new URL(String(rawUrl));
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

function htmlImages(html = '') {
  const matches = [...String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
  return matches.map(match => imageCandidate(match[1])).filter(Boolean);
}

function extractImage(item) {
  const enclosureCandidates = asArray(item.enclosure)
    .map(imageCandidate)
    .filter(candidate => candidate && (!candidate.type || candidate.type.startsWith('image/')));

  const mediaCandidates = [
    ...asArray(item.mediaContent),
    ...asArray(item.mediaThumbnail),
    ...asArray(item.image),
    ...asArray(item.thumbnail)
  ].map(imageCandidate).filter(Boolean);

  const embeddedCandidates = htmlImages(item.content || item.description || item.summary || '');
  const candidates = [...enclosureCandidates, ...mediaCandidates, ...embeddedCandidates];
  if (!candidates.length) return null;

  candidates.sort((a, b) => imageScore(b) - imageScore(a));
  return candidates[0]?.url || null;
}

export async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const cutoff = Date.now() - config.lookbackHours * 60 * 60 * 1000;

  return (parsed.items || [])
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
        imageUrl: extractImage(item)
      };
    })
    .filter(item => item.link && new Date(item.publishedAt).getTime() >= cutoff);
}
