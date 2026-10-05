import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.mjs';
import { db, listCategories, listFeeds, slugify } from './db.mjs';
import { checkOllama } from './services/ollama.mjs';
import { buildEdition, invalidateEditions, listArticles, refreshNews, refreshStatus } from './services/news.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/'
});

app.get('/api/health', async () => ({
  app: 'Highlords Post',
  version: '0.2.0',
  ollama: await checkOllama(),
  refresh: refreshStatus()
}));

app.get('/api/categories', async () => listCategories());

app.post('/api/categories', async (request, reply) => {
  const name = String(request.body?.name || '').trim();
  const description = String(request.body?.description || '').trim();
  const slug = slugify(request.body?.slug || name);

  if (!name || !slug) return reply.code(400).send({ error: 'Nome da categoria é obrigatório.' });

  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS value FROM categories').get().value;
  try {
    db.prepare(`
      INSERT INTO categories (slug, name, description, position)
      VALUES (?, ?, ?, ?)
    `).run(slug, name.slice(0, 80), description.slice(0, 700), Number(max) + 10);
  } catch {
    return reply.code(409).send({ error: 'Já existe uma categoria com esse identificador.' });
  }
  invalidateEditions();
  return reply.code(201).send(listCategories());
});

app.put('/api/categories/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Categoria inválida.' });
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!existing) return reply.code(404).send({ error: 'Categoria não encontrada.' });

  const name = String(request.body?.name ?? existing.name).trim().slice(0, 80);
  const description = String(request.body?.description ?? existing.description).trim().slice(0, 700);
  const position = Number.isFinite(Number(request.body?.position)) ? Number(request.body.position) : existing.position;
  const enabled = request.body?.enabled == null ? existing.enabled : (request.body.enabled ? 1 : 0);
  if (!name) return reply.code(400).send({ error: 'Nome da categoria é obrigatório.' });

  db.prepare(`
    UPDATE categories
    SET name = ?, description = ?, position = ?, enabled = ?
    WHERE id = ?
  `).run(name, description, position, enabled, id);
  invalidateEditions();
  return listCategories();
});

app.delete('/api/categories/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Categoria inválida.' });
  const category = db.prepare('SELECT slug FROM categories WHERE id = ?').get(id);
  if (!category) return reply.code(404).send({ error: 'Categoria não encontrada.' });
  db.prepare('UPDATE articles SET category_slug = NULL WHERE category_slug = ?').run(category.slug);
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  invalidateEditions();
  return { ok: true };
});

app.get('/api/feeds', async () => listFeeds());

app.post('/api/feeds', async (request, reply) => {
  const name = String(request.body?.name || '').trim();
  const url = String(request.body?.url || '').trim();
  if (!name || !url) return reply.code(400).send({ error: 'Nome e URL são obrigatórios.' });

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch {
    return reply.code(400).send({ error: 'Use uma URL RSS/Atom http(s) válida.' });
  }

  try {
    db.prepare('INSERT INTO feeds (name, url) VALUES (?, ?)').run(name.slice(0, 100), url);
  } catch {
    return reply.code(409).send({ error: 'Esse feed já foi adicionado.' });
  }

  return reply.code(201).send(listFeeds());
});

app.delete('/api/feeds/:id', async (request, reply) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Feed inválido.' });
  db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
  return { ok: true };
});

app.get('/api/articles', async request => {
  const categories = String(request.query?.categories || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return listArticles({ categories, limit: request.query?.limit });
});

app.get('/api/edition', async request => {
  const categories = String(request.query?.categories || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return buildEdition(categories);
});

app.get('/api/refresh/status', async () => refreshStatus());

app.post('/api/refresh', async (request, reply) => {
  const status = refreshStatus();
  if (status.running) return reply.code(202).send(status);
  refreshNews().catch(error => app.log.error(error));
  return reply.code(202).send({ running: true });
});

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Endpoint não encontrado.' });
  return reply.sendFile('index.html');
});

await app.listen({ port: config.port, host: config.host });
app.log.info(`Highlords Post disponível em http://${config.host}:${config.port}`);

if (config.refreshOnStart) {
  refreshNews().catch(error => app.log.error(error));
}

if (config.refreshIntervalMinutes > 0) {
  const interval = config.refreshIntervalMinutes * 60 * 1000;
  setInterval(() => {
    refreshNews().catch(error => app.log.error(error));
  }, interval).unref();
}
