import dns from 'node:dns/promises';
import net from 'node:net';

const cache = new Map();
const MAX_CACHE_ITEMS = 120;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version !== 6) return true;

  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    const embedded = normalized.slice('::ffff:'.length);
    return net.isIP(embedded) === 4 ? isPrivateIPv4(embedded) : true;
  }
  return false;
}

async function assertPublicUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Protocolo de imagem inválido.');

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Host de imagem não permitido.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Endereço de imagem privado não permitido.');
    return url;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isPrivateIp(entry.address))) {
    throw new Error('Host de imagem não permitido.');
  }
  return url;
}

async function fetchFollowingRedirects(initialUrl, depth = 0) {
  if (depth > 4) throw new Error('Muitos redirecionamentos de imagem.');
  const url = await assertPublicUrl(initialUrl);

  const response = await fetch(url, {
    redirect: 'manual',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HighlordsPost/0.4',
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    },
    signal: AbortSignal.timeout(10000)
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error('Redirecionamento de imagem inválido.');
    return fetchFollowingRedirects(new URL(location, url).toString(), depth + 1);
  }

  return response;
}

function remember(key, value) {
  cache.set(key, { ...value, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_CACHE_ITEMS) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

export async function fetchRemoteImage(rawUrl) {
  const key = String(rawUrl || '');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (cached) cache.delete(key);

  const response = await fetchFollowingRedirects(key);
  if (!response.ok) throw new Error(`Imagem remota HTTP ${response.status}.`);

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('O recurso remoto não é uma imagem.');

  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error('Imagem remota grande demais.');

  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > MAX_IMAGE_BYTES) throw new Error('Imagem remota inválida.');

  const result = { contentType, body };
  remember(key, result);
  return result;
}
