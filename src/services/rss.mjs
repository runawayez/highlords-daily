import Parser from 'rss-parser';
import { config } from '../config.mjs';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'HighlordsPost/0.1 (+https://github.com/runawayez/highlords-post)'
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
        excerpt: excerpt.slice(0, 1800)
      };
    })
    .filter(item => item.link && new Date(item.publishedAt).getTime() >= cutoff);
}
