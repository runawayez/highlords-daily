import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.mjs';
import { db, listCategories, listFeeds } from './db.mjs';
import { checkOllama } from './services/ollama.mjs';
import { fetchRemoteImage } from './services/image.mjs';
import { listArticles, refreshNews, refreshStatus } from './services/news.mjs';
import {
  dailyDateKey,
  generateDailyEdition,
  getDailyEdition,
  getLatestDailyEdition,
  listDailyArchive
} from './services/daily.mjs';
import { renderDailyPdf } from './services/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/'
});

app.get('/api/health', async () => {
  const latestEdition = getLatestDailyEdition();
  return {
    app: 'Highlords Daily',
    version: '1.0.0',
    ollama: await checkOllama(),
    refresh: refreshStatus(),
    daily: {
      latestEdition: latestEdition?.editionDate || null,
      autoGenerate: config.dailyAutoGenerate,
      generateHour: config.dailyGenerateHour,
      timeZone: config.timeZone
    }
  };
});

app.get('/api/categories', async () => listCategories());

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

app.get('/api/daily/current', async () => ({
  edition: getDailyEdition(dailyDateKey())
}));

app.get('/api/daily/latest', async () => ({
  edition: getLatestDailyEdition()
}));

app.get('/api/daily/archive', async request => ({
  editions: listDailyArchive(request.query?.limit)
}));

app.get('/api/daily/:date/pdf', async (request, reply) => {
  const edition = getDailyEdition(String(request.params.date || ''));
  if (!edition) return reply.code(404).send({ error: 'Edição não encontrada.' });

  const pdf = await renderDailyPdf(edition);
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `attachment; filename="highlords-daily-${edition.editionDate}.pdf"`)
    .header('Cache-Control', 'private, no-cache')
    .send(pdf);
});

app.get('/api/daily/:date', async (request, reply) => {
  const edition = getDailyEdition(String(request.params.date || ''));
  if (!edition) return reply.code(404).send({ error: 'Edição não encontrada.' });
  return { edition };
});

app.post('/api/daily/generate', async (request, reply) => {
  if (refreshStatus().running) {
    return reply.code(409).send({ error: 'A coleta ainda está em andamento. Aguarde a análise terminar.' });
  }

  try {
    const edition = await generateDailyEdition({
      date: String(request.body?.date || dailyDateKey()),
      force: Boolean(request.body?.force)
    });
    return { edition };
  } catch (error) {
    if (error?.code === 'NO_DAILY_CANDIDATES') {
      return reply.code(409).send({ error: error.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'Não foi possível gerar a edição.' });
  }
});

app.get('/api/image', async (request, reply) => {
  const url = String(request.query?.url || '').trim();
  if (!url) return reply.code(400).send({ error: 'URL de imagem ausente.' });

  try {
    const image = await fetchRemoteImage(url);
    return reply
      .header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      .type(image.contentType)
      .send(image.body);
  } catch (error) {
    request.log.debug({ err: error, url }, 'Falha ao carregar imagem remota');
    return reply.code(404).send({ error: 'Imagem indisponível.' });
  }
});

app.get('/api/refresh/status', async () => refreshStatus());

app.post('/api/refresh', async (request, reply) => {
  const status = refreshStatus();
  if (status.running) return reply.code(202).send(status);
  refreshNews().catch(error => app.log.error(error));
  return reply.code(202).send({ running: true });
});

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Endpoint não encontrado.' });
  }
  return reply.sendFile('index.html');
});

await app.listen({ port: config.port, host: config.host });
app.log.info(`Highlords Daily disponível em http://${config.host}:${config.port}`);

if (config.refreshOnStart) {
  refreshNews().catch(error => app.log.error(error));
}

if (config.refreshIntervalMinutes > 0) {
  const interval = config.refreshIntervalMinutes * 60 * 1000;
  setInterval(() => {
    refreshNews().catch(error => app.log.error(error));
  }, interval).unref();
}

let scheduledDailyRunning = false;
if (config.dailyAutoGenerate) {
  setInterval(async () => {
    if (scheduledDailyRunning || refreshStatus().running) return;

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timeZone,
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const hour = Number(parts.find(part => part.type === 'hour')?.value);
    const today = dailyDateKey();

    if (hour !== config.dailyGenerateHour || getDailyEdition(today)) return;

    scheduledDailyRunning = true;
    try {
      let passes = 0;
      do {
        await refreshNews();
        passes += 1;
      } while ((refreshStatus().lastRun?.backlog || 0) > 0 && passes < 12);

      await generateDailyEdition({ date: today, force: true });
      app.log.info({ editionDate: today }, 'Edição diária gerada automaticamente');
    } catch (error) {
      app.log.error(error, 'Falha ao gerar edição diária automaticamente');
    } finally {
      scheduledDailyRunning = false;
    }
  }, 60_000).unref();
}
