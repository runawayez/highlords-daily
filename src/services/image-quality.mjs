const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PROBE_BYTES = 384 * 1024;
const MIN_IMAGE_BYTES = 8 * 1024;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 240;
const MIN_AREA = 180_000;

const weakImagePattern = /(?:^|[\/_\-.])(placeholder|no[-_ ]?image|no[-_ ]?photo|sem[-_ ]?imagem|missing[-_ ]?image|default[-_ ]?(?:image|photo|thumb|thumbnail)|fallback[-_ ]?(?:image|photo)|generic[-_ ]?(?:image|photo)|image[-_ ]?not[-_ ]?found|blank[-_ ]?(?:image|photo))(?:[\/_\-.]|$)/i;
const chromeImagePattern = /(?:^|[\/_\-.])(favicon|sprite|tracking[-_ ]?pixel|spacer|avatar[-_ ]?default)(?:[\/_\-.]|$)/i;
const pageChromePattern = /\b(logo|favicon|avatar|author|sprite|icon|menu|header|footer|advert|ads?|banner|tracking|pixel)\b/i;
const STOPWORDS = new Set(['para','com','sem','uma','uns','umas','que','por','dos','das','the','and','for','with','from','this','that','into','sobre','após','apos','como','mais','menos','novo','nova']);

function safeUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || ''), baseUrl || undefined);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1]?.trim() || null;
}

function titleTokens(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 4 && !STOPWORDS.has(token))
    .slice(0, 16);
}

export function canonicalImageKey(value = '') {
  try {
    const url = new URL(String(value));
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
}

export function suspiciousImageUrl(value = '') {
  const url = String(value || '').toLowerCase();
  return weakImagePattern.test(url) || chromeImagePattern.test(url);
}

function dimensionsPng(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function dimensionsGif(buffer) {
  if (buffer.length < 10 || !/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function dimensionsJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (marker === 0xda) break;
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    if (sof.has(marker) && offset + 9 < buffer.length) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function dimensionsWebp(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X' && buffer.length >= 30) {
    const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
    const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
    return { width, height };
  }
  if (kind === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (kind === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21], b2 = buffer[22], b3 = buffer[23], b4 = buffer[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
    };
  }
  return null;
}

export function imageDimensions(buffer, contentType = '') {
  const type = String(contentType).split(';')[0].trim().toLowerCase();
  if (type === 'image/png') return dimensionsPng(buffer);
  if (type === 'image/jpeg' || type === 'image/jpg') return dimensionsJpeg(buffer);
  if (type === 'image/gif') return dimensionsGif(buffer);
  if (type === 'image/webp') return dimensionsWebp(buffer);
  return dimensionsPng(buffer) || dimensionsJpeg(buffer) || dimensionsGif(buffer) || dimensionsWebp(buffer);
}

export function inspectImageBuffer(buffer, contentType = '', url = '', declaredBytes = 0) {
  const type = String(contentType).split(';')[0].trim().toLowerCase();
  if (!type.startsWith('image/')) return { ok: false, reason: 'content-type não é imagem' };
  if (type === 'image/svg+xml') return { ok: false, reason: 'SVG não é aceito como foto editorial' };
  if (suspiciousImageUrl(url)) return { ok: false, reason: 'URL parece placeholder/imagem genérica' };

  const totalBytes = Math.max(Number(declaredBytes || 0), buffer.length);
  if (totalBytes < MIN_IMAGE_BYTES) return { ok: false, reason: `imagem muito pequena (${totalBytes} bytes)` };
  if (totalBytes > MAX_IMAGE_BYTES) return { ok: false, reason: 'imagem maior que 12 MB' };

  const dimensions = imageDimensions(buffer, type);
  if (dimensions) {
    const area = dimensions.width * dimensions.height;
    if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT || area < MIN_AREA) {
      return { ok: false, reason: `dimensões insuficientes (${dimensions.width}x${dimensions.height})`, ...dimensions };
    }
    if (totalBytes / area < 0.018) {
      return { ok: false, reason: 'imagem excessivamente simples/compacta para uso editorial', ...dimensions };
    }
  } else if (!['image/avif'].includes(type)) {
    return { ok: false, reason: 'não foi possível validar as dimensões da imagem' };
  }

  return { ok: true, type, bytes: totalBytes, ...(dimensions || {}) };
}

async function readPrefix(response, maxBytes = PROBE_BYTES) {
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.subarray(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      const remaining = maxBytes - total;
      chunks.push(chunk.subarray(0, remaining));
      total += Math.min(chunk.length, remaining);
      if (chunk.length > remaining) break;
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

function declaredSize(response) {
  const range = String(response.headers.get('content-range') || '').match(/\/(\d+)$/);
  if (range) return Number(range[1]);
  return Number(response.headers.get('content-length') || 0);
}

export async function probeImageUrl(url, { timeoutMs = 6500 } = {}) {
  const normalized = safeUrl(url);
  if (!normalized) return { ok: false, reason: 'URL inválida', url };
  if (suspiciousImageUrl(normalized)) return { ok: false, reason: 'URL parece placeholder/imagem genérica', url: normalized };
  try {
    const response = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 HighlordsDaily/4.0',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        range: `bytes=0-${PROBE_BYTES - 1}`
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok && response.status !== 206) return { ok: false, reason: `HTTP ${response.status}`, url: normalized };
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    const prefix = await readPrefix(response);
    const inspected = inspectImageBuffer(prefix, type, response.url || normalized, declaredSize(response));
    return { ...inspected, url: response.url || normalized };
  } catch (error) {
    return { ok: false, reason: error.message || String(error), url: normalized };
  }
}

export async function fetchValidatedImageBuffer(url, { timeoutMs = 12000 } = {}) {
  const normalized = safeUrl(url);
  if (!normalized) return { ok: false, reason: 'URL inválida', url };
  if (suspiciousImageUrl(normalized)) return { ok: false, reason: 'URL parece placeholder/imagem genérica', url: normalized };
  try {
    const response = await fetch(normalized, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 HighlordsDaily/4.0',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}`, url: normalized };
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) return { ok: false, reason: 'imagem maior que 12 MB', url: normalized };
    const buffer = Buffer.from(await response.arrayBuffer());
    const inspected = inspectImageBuffer(buffer, type, response.url || normalized, contentLength);
    return { ...inspected, url: response.url || normalized, buffer };
  } catch (error) {
    return { ok: false, reason: error.message || String(error), url: normalized };
  }
}

function candidateScore(candidate, article) {
  const haystack = `${candidate.url} ${candidate.alt || ''} ${candidate.title || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = titleTokens(article?.originalTitle || article?.headline || '');
  const overlap = tokens.filter(token => haystack.includes(token)).length;
  let score = candidate.kind === 'meta' ? 18 : 4;
  score += overlap * 12;
  if (candidate.width >= MIN_WIDTH && candidate.height >= MIN_HEIGHT) score += 8;
  if (pageChromePattern.test(`${candidate.alt || ''} ${candidate.title || ''} ${candidate.url}`)) score -= 30;
  if (suspiciousImageUrl(candidate.url)) score -= 100;
  return score;
}

function srcFromTag(tag, baseUrl) {
  const direct = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original');
  if (direct && !direct.startsWith('data:')) return safeUrl(direct, baseUrl);
  const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  if (!srcset) return null;
  const parts = srcset.split(',').map(part => part.trim().split(/\s+/)[0]).filter(Boolean);
  return parts.length ? safeUrl(parts[parts.length - 1], baseUrl) : null;
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export async function discoverPageImageCandidates(article, { timeoutMs = 7000 } = {}) {
  if (!article?.link) return [];
  try {
    const response = await fetch(article.link, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 HighlordsDaily/4.0',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return [];
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return [];
    const html = (await response.text()).slice(0, 750_000);
    const baseUrl = response.url || article.link;
    const candidates = [];

    for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
      const url = safeUrl(metaContent(html, key), baseUrl);
      if (url) candidates.push({ url, kind: 'meta', alt: '', title: '', width: 0, height: 0 });
    }

    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = match[0];
      const url = srcFromTag(tag, baseUrl);
      if (!url) continue;
      candidates.push({
        url,
        kind: 'content',
        alt: attr(tag, 'alt') || '',
        title: attr(tag, 'title') || '',
        width: Number(attr(tag, 'width') || 0),
        height: Number(attr(tag, 'height') || 0)
      });
    }

    const unique = new Map();
    for (const candidate of candidates) {
      const key = canonicalImageKey(candidate.url);
      const score = candidateScore(candidate, article);
      const existing = unique.get(key);
      if (!existing || score > existing.score) unique.set(key, { ...candidate, score });
    }

    return [...unique.values()]
      .filter(candidate => candidate.score > -20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function urlContextScore(url, article) {
  const normalized = String(url || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return titleTokens(article?.originalTitle || article?.headline || '').filter(token => normalized.includes(token)).length;
}

export async function resolveBestArticleImage(article, currentUrl = null, { forcePage = false } = {}) {
  let current = null;
  if (!forcePage && currentUrl) {
    current = await probeImageUrl(currentUrl);
    if (current.ok && urlContextScore(current.url, article) > 0) return current.url;
  }

  const pageCandidates = await discoverPageImageCandidates(article);
  for (const candidate of pageCandidates.slice(0, 6)) {
    if (current?.ok && canonicalImageKey(candidate.url) === canonicalImageKey(current.url)) continue;
    const probed = await probeImageUrl(candidate.url);
    if (probed.ok) return probed.url;
  }

  return current?.ok ? current.url : null;
}
