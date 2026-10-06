import Parser from 'rss-parser';
import { categories, config, feeds } from '../config.mjs';
import { canonicalImageKey, resolveBestArticleImage } from './image-quality.mjs';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'HighlordsDaily/4.0 (+https://github.com/runawayez/highlords-daily)'
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail']
    ]
  }
});

const categorySlugs = new Set(categories.map(category => category.slug));

function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function searchText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const filmSeriesSignal = /\b(filme|filmes|cinema|ator|atriz|atores|atrizes|diretor|diretora|bilheteria|oscar|emmy|documentario|documentarios|k drama|k dramas|anime|animes|rotten tomatoes)\b/;
const seriesContextSignal = /\b(serie|series|temporada|episodio|episodios)\b/;
const streamingContextSignal = /\b(streaming|netflix|hbo|max|prime video|disney\+|paramount\+|globoplay|apple tv)\b/;
const gameSignal = /\b(game|games|gaming|videogame|videogames|video game|xbox|playstation|nintendo|steam|gameplay|console|consoles|dlc|rpg|fps|ea fc|fortnite|gta)\b/;
const soccerSignal = /\b(futebol|brasileirao|libertadores|copa do brasil|champions league|goleiro|goleira|zagueiro|zagueira|atacante|mercado da bola|selecao brasileira de futebol|serie a|serie b)\b/;
const politicsSignal = /\b(tse|stf|tribunal superior eleitoral|justica eleitoral|eleicao|eleicoes|eleitoral|urna|urnas|presidencial|congresso nacional|camara dos deputados|senado federal|partido politico|partidos politicos)\b/;
const economySignal = /\b(economia|economico|economica|mercado|mercados|bolsa|acoes|inflacao|juros|selic|pib|dolar|cambio|fiscal|imposto|impostos|tributacao|investimento|investimentos|lucro|receita|balanca comercial|superavit|deficit|emprego|desemprego|banco central)\b/;

function canForceCategory(article, slug) {
  if (!categorySlugs.has(slug)) return false;
  if (!article.strictFocus || !Array.isArray(article.focus) || article.focus.length === 0) return true;
  return article.focus.includes(slug);
}

function routeToCategory(article, slug, reason) {
  return {
    ...article,
    focus: [slug],
    strictFocus: true,
    editorialGuardrail: reason
  };
}

function rejectArticle(article, reason) {
  return { ...article, editorialReject: true, editorialGuardrail: reason };
}

function applyEditorialGuardrails(article) {
  const text = searchText(`${article.originalTitle} ${article.excerpt}`);
  const isEconomy = economySignal.test(text);
  const isFilmSeries = filmSeriesSignal.test(text)
    || (seriesContextSignal.test(text) && streamingContextSignal.test(text));
  const isGame = gameSignal.test(text);
  const isSoccer = soccerSignal.test(text);
  const isPolitics = politicsSignal.test(text);

  const economyOnly = article.strictFocus
    && Array.isArray(article.focus)
    && article.focus.length === 1
    && article.focus[0] === 'economia';

  if (economyOnly && isPolitics && !isEconomy) {
    return rejectArticle(article, 'strict-economy-off-topic-politics');
  }

  if (economyOnly && isEconomy) return article;

  if (isFilmSeries && !isGame) {
    if (canForceCategory(article, 'filmes-series')) {
      return routeToCategory(article, 'filmes-series', 'clear-film-series-signal');
    }
    if (article.strictFocus) return rejectArticle(article, 'film-series-outside-strict-focus');
  }

  if (isSoccer && !isGame) {
    if (canForceCategory(article, 'futebol')) {
      return routeToCategory(article, 'futebol', 'clear-soccer-signal');
    }
    if (article.strictFocus) return rejectArticle(article, 'soccer-outside-strict-focus');
  }

  if (isGame) {
    if (canForceCategory(article, 'games')) {
      return routeToCategory(article, 'games', 'clear-game-signal');
    }
    if (article.strictFocus) return rejectArticle(article, 'game-outside-strict-focus');
  }

  return article;
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
    if (/\/(?:embed|player)\//i.test(url.pathname)) return null;
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

async function resolveArticleImage(article, imageMode) {
  if (imageMode === 'off') return null;
  return resolveBestArticleImage(article, article.imageUrl, { forcePage: imageMode === 'page' });
}

async function enrichImages(articles, imageMode) {
  let cursor = 0;
  const workers = Math.min(4, articles.length);
  async function worker() {
    while (cursor < articles.length) {
      const index = cursor++;
      articles[index].imageUrl = await resolveArticleImage(articles[index], imageMode);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  return articles;
}

async function fetchFeed(feed) {
  const parsed = await parser.parseURL(feed.url);
  const cutoff = Date.now() - config.lookbackHours * 60 * 60 * 1000;
  const prepared = (parsed.items || [])
    .slice(0, config.maxItemsPerFeed)
    .map((item, index) => {
      const published = itemDate(item);
      const link = item.link || item.guid;
      const excerpt = stripHtml(item.contentSnippet || item.content || item.summary || item.description || '');
      return {
        id: `${feed.name}:${item.guid || item.id || link || index}`,
        source: feed.name || parsed.title || new URL(feed.url).hostname,
        focus: Array.isArray(feed.focus) ? feed.focus : [],
        strictFocus: Boolean(feed.strictFocus),
        originalTitle: stripHtml(item.title || 'Sem título'),
        link,
        publishedAt: published.toISOString(),
        excerpt: excerpt.slice(0, 1400),
        imageUrl: feed.imageMode === 'auto' ? extractImage(item, link || feed.url) : null
      };
    })
    .filter(article => article.link && new Date(article.publishedAt).getTime() >= cutoff)
    .map(applyEditorialGuardrails)
    .filter(article => !article.editorialReject);

  if (feed.imageMode === 'off') return prepared;
  return enrichImages(prepared, feed.imageMode);
}

function dedupe(articles) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  return articles.filter(article => {
    const titleKey = article.originalTitle.toLocaleLowerCase(config.language).replace(/\W+/g, ' ').trim();
    if (seenLinks.has(article.link) || (titleKey && seenTitles.has(titleKey))) return false;
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

  return articles.map(article => {
    if (!article.imageUrl) return article;
    const key = `${article.source}\n${canonicalImageKey(article.imageUrl)}`;
    if ((counts.get(key) || 0) < 2) return article;
    return { ...article, imageUrl: null, imageRejectedReason: 'repeated-source-image' };
  });
}

function balancedLimit(articles, feedList, limit) {
  if (articles.length <= limit) {
    return [...articles].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }

  const quota = Math.max(1, Math.floor(limit / Math.max(1, feedList.length)));
  const selected = [];
  const selectedLinks = new Set();

  for (const feed of feedList) {
    const fromFeed = articles
      .filter(article => article.source === feed.name)
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, quota);

    for (const article of fromFeed) {
      if (selected.length >= limit) break;
      selected.push(article);
      selectedLinks.add(article.link);
    }
  }

  const remaining = articles
    .filter(article => !selectedLinks.has(article.link))
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  for (const article of remaining) {
    if (selected.length >= limit) break;
    selected.push(article);
  }

  return selected.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

export async function fetchAllFeeds(onProgress = () => {}, feedList = feeds) {
  const articles = [];
  const errors = [];

  for (let index = 0; index < feedList.length; index += 1) {
    const feed = feedList[index];
    onProgress({ index: index + 1, total: feedList.length, feed: feed.name });
    try {
      articles.push(...await fetchFeed(feed));
    } catch (error) {
      errors.push(`${feed.name}: ${error.message || String(error)}`);
    }
  }

  const unique = suppressRepeatedSourceImages(dedupe(articles));
  const withImages = config.requireImages ? unique.filter(article => article.imageUrl) : unique;
  const imageRejected = config.requireImages ? unique.length - withImages.length : 0;
  const selected = balancedLimit(withImages, feedList, config.maxCandidates);

  selected.forEach((article, index) => { article.id = index + 1; });
  return { articles: selected, errors, imageRejected };
}
