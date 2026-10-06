import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.mjs';

function extensionFor(contentType = '') {
  const type = String(contentType).split(';')[0].trim().toLowerCase();
  const map = new Map([
    ['image/jpeg', 'jpg'],
    ['image/jpg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/avif', 'avif'],
    ['image/gif', 'gif'],
    ['image/svg+xml', 'svg']
  ]);
  return map.get(type) || null;
}

async function downloadImage(article, assetsDir) {
  if (!article?.imageUrl || !/^https?:\/\//i.test(article.imageUrl)) return article;
  const originalImageUrl = article.imageUrl;
  try {
    const response = await fetch(originalImageUrl, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 HighlordsDaily/4.0',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const extension = extensionFor(response.headers.get('content-type'));
    if (!extension) throw new Error('content-type não é imagem suportada');
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 12 * 1024 * 1024) throw new Error('imagem maior que 12 MB');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error('imagem vazia ou muito grande');

    const hash = crypto.createHash('sha1').update(originalImageUrl).digest('hex').slice(0, 10);
    const filename = `story-${String(article.id).replace(/[^a-z0-9_-]/gi, '-')}-${hash}.${extension}`;
    const target = path.join(assetsDir, filename);
    await fs.writeFile(target, buffer);
    return {
      ...article,
      originalImageUrl,
      imageUrl: `assets/${filename}`,
      imageCached: true
    };
  } catch (error) {
    return {
      ...article,
      originalImageUrl,
      imageCached: false,
      imageCacheError: error.message || String(error)
    };
  }
}

export async function cacheEditionImages(edition, editionDir) {
  if (!config.cacheImages || !edition) return { edition, cached: 0, failed: 0 };
  const assetsDir = path.join(editionDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });

  const unique = new Map();
  for (const article of [edition.lead, ...edition.sections.flatMap(section => section.articles || [])].filter(Boolean)) {
    if (!unique.has(article.id)) unique.set(article.id, article);
  }

  const entries = [...unique.values()];
  const cachedById = new Map();
  let cursor = 0;
  const workers = Math.min(4, entries.length);
  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      const cached = await downloadImage(entries[index], assetsDir);
      cachedById.set(entries[index].id, cached);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));

  const replace = article => article ? (cachedById.get(article.id) || article) : article;
  const nextEdition = {
    ...edition,
    lead: replace(edition.lead),
    sections: edition.sections.map(section => ({
      ...section,
      articles: (section.articles || []).map(replace)
    }))
  };

  let cached = 0;
  let failed = 0;
  for (const article of cachedById.values()) {
    if (article.imageCached) cached += 1;
    else if (article.imageUrl) failed += 1;
  }
  return { edition: nextEdition, cached, failed };
}
