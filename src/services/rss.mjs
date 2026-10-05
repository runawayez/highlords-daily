import Parser from 'rss-parser';
import { config } from '../config.mjs';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'HighlordsPost/0.3 (+https://github.com/runawayez/highlords-post)'
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

function normalizeImage(value) {
  const candidate = typeof value === 'string'
    ? value
    : value?.url || value?.$?.url || value?.href || value?.$?.href;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractImage(item) {
  const direct = [
    item.enclosure,
    item.mediaContent,
    item.mediaThumbnail,
    item.image,
    item.thumbnail
  ].map(normalizeImage).find(Boolean);
  if (direct) return direct;

  const html = String(item.content || item.description || item.summary || '');
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return normalizeImage(match?.[1]);
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
