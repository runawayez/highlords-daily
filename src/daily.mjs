import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { categories, config, editorial, profile, publication } from './config.mjs';
import { fetchAllFeeds } from './services/rss.mjs';
import { analyzeArticles, curateNewsletter, ensureOllama } from './services/ollama.mjs';
import { renderHtmlPdf } from './services/html-pdf.mjs';
import { cacheEditionImages } from './services/image-cache.mjs';
import { deduplicateArticles, filterPreviouslyPublished, pruneHistory, rememberEdition } from './services/memory.mjs';
import { updateArchive } from './services/archive.mjs';
import { loadPlugins, runPluginExporters, runPluginHook } from './plugins.mjs';
import { renderMarkdown } from './exporters/markdown.mjs';
import { renderEmailHtml } from './exporters/email.mjs';
import { renderDiscordMarkdown, renderSocialText } from './exporters/social.mjs';
import { renderNewsletterHtml } from './template.mjs';

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function curatedId(value) {
  const raw = value && typeof value === 'object'
    ? value.id ?? value.articleId ?? value.article_id ?? value.newsId ?? value.news_id
    : value;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function categoryCounts(articles) {
  const counts = new Map(categories.map(category => [category.slug, 0]));
  for (const article of articles) {
    if (counts.has(article.category)) counts.set(article.category, counts.get(article.category) + 1);
  }
  return counts;
}

function chooseLead(requestedLead, articles) {
  const counts = categoryCounts(articles);
  const canSpareForLead = article => article && (counts.get(article.category) || 0) > config.itemsPerCategory;
  if (canSpareForLead(requestedLead)) return { lead: requestedLead, rebalanced: false };

  const alternative = articles.find(canSpareForLead);
  if (alternative) {
    return { lead: alternative, rebalanced: Boolean(requestedLead && alternative.id !== requestedLead.id) };
  }
  return { lead: requestedLead || articles[0] || null, rebalanced: false };
}

function fallbackCopy() {
  if (config.language.toLowerCase().startsWith('pt')) {
    return {
      title: 'O que vale sua atenção hoje',
      intro: 'Uma seleção curta do que mais vale sua atenção hoje, sem excesso de ruído.'
    };
  }
  return {
    title: 'What deserves your attention today',
    intro: 'A concise selection of the stories most worth your attention today, without the noise.'
  };
}

function localizedSectionName(curated, category) {
  const value = curated?.sectionTitles?.[category.slug];
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  return category.name;
}

function normalizeUi(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, text]) => typeof text === 'string' && text.trim())
      .map(([key, text]) => [key, text.trim().slice(0, 120)])
  );
}

function canUseSource(article, globalCounts, sectionCounts) {
  const global = globalCounts.get(article.source) || 0;
  const section = sectionCounts.get(article.source) || 0;
  if (config.maxItemsPerSource > 0 && global >= config.maxItemsPerSource) return false;
  if (config.maxItemsPerSourcePerSection > 0 && section >= config.maxItemsPerSourcePerSection) return false;
  return true;
}

function registerSource(article, globalCounts, sectionCounts) {
  globalCounts.set(article.source, (globalCounts.get(article.source) || 0) + 1);
  sectionCounts.set(article.source, (sectionCounts.get(article.source) || 0) + 1);
}

function normalizeNewsletter(curated, articles, editionDate) {
  const byId = new Map(articles.map(article => [Number(article.id), article]));
  const used = new Set();
  const globalSourceCounts = new Map();
  const requestedLeadId = curatedId(curated?.leadId ?? curated?.lead ?? curated?.headlineId ?? curated?.mancheteId);
  const requestedLead = requestedLeadId != null ? byId.get(requestedLeadId) : null;
  const { lead, rebalanced: leadRebalanced } = chooseLead(requestedLead, articles);
  if (lead) {
    used.add(lead.id);
    globalSourceCounts.set(lead.source, 1);
  }

  let backfilled = 0;
  let diversityRelaxed = 0;
  const sections = categories.map(category => {
    const requested = Array.isArray(curated?.sections?.[category.slug]) ? curated.sections[category.slug] : [];
    const selected = [];
    const sectionSourceCounts = new Map();

    const tryAdd = (article, { relaxed = false, backfill = false } = {}) => {
      if (!article || article.category !== category.slug || used.has(article.id)) return false;
      if (!relaxed && !canUseSource(article, globalSourceCounts, sectionSourceCounts)) return false;
      used.add(article.id);
      selected.push(article);
      registerSource(article, globalSourceCounts, sectionSourceCounts);
      if (backfill) backfilled += 1;
      if (relaxed) diversityRelaxed += 1;
      return true;
    };

    for (const rawValue of requested) {
      const id = curatedId(rawValue);
      if (id == null) continue;
      tryAdd(byId.get(id));
      if (selected.length >= config.itemsPerCategory) break;
    }

    const candidates = articles.filter(article => article.category === category.slug && !used.has(article.id));
    for (const article of candidates) {
      if (selected.length >= config.itemsPerCategory) break;
      tryAdd(article, { backfill: true });
    }

    if (selected.length < config.itemsPerCategory && !config.sourceDiversityStrict) {
      for (const article of articles) {
        if (selected.length >= config.itemsPerCategory) break;
        tryAdd(article, { relaxed: true, backfill: true });
      }
    }

    return { slug: category.slug, name: localizedSectionName(curated, category), articles: selected };
  });

  const chosen = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  const fallback = fallbackCopy();
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: 'ollama',
    selectionMode: backfilled > 0 ? 'ollama+section-backfill' : 'ollama',
    preset: editorial.preset,
    profile: profile.name,
    language: config.language,
    editorialContext: config.editorialContext,
    publication: publication.name,
    title: String(curated?.title || fallback.title).trim().slice(0, 120),
    intro: String(curated?.intro || fallback.intro).trim().slice(0, 420),
    ui: normalizeUi(curated?.ui),
    lead,
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(chosen.map(article => article.source)).size,
      candidates: articles.length,
      backfilled,
      diversityRelaxed,
      leadRebalanced
    }
  };
}

function fallbackNewsletter(articles, editionDate) {
  const fallback = fallbackCopy();
  const edition = normalizeNewsletter({ leadId: articles[0]?.id, title: fallback.title, intro: fallback.intro, sections: {} }, articles, editionDate);
  edition.selectionMode = 'ranking-fallback';
  return edition;
}

function sectionReport(edition) {
  return edition.sections.map(section => `${section.name}: ${section.articles.length}`).join(' | ');
}

async function openFile(filePath) {
  if (!config.autoOpen) return;
  const absolute = path.resolve(filePath);
  try {
    let child;
    if (process.platform === 'win32') child = spawn('cmd.exe', ['/c', 'start', '', absolute], { detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') child = spawn('open', [absolute], { detached: true, stdio: 'ignore' });
    else child = spawn('xdg-open', [absolute], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {}
}

function mimeForLogo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' })[ext] || 'application/octet-stream';
}

async function loadLogoDataUri() {
  try {
    const buffer = await fs.readFile(publication.logoFile);
    return `data:${mimeForLogo(publication.logoFile)};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function logAnalysisProgress(event) {
  if (event.status === 'start') {
    process.stdout.write(`  lote ${event.batch}/${event.totalBatches}... `);
    return;
  }
  if (event.status === 'done') {
    const details = [
      `${event.approved} aprovadas`,
      `${event.classified} classificadas`,
      `${event.invalidCategory} sem categoria`,
      `${event.strictMismatch || 0} fora do foco estrito`,
      `${event.belowScore} abaixo de ${config.llmMinScore}`,
      `${event.missing} ausentes`
    ];
    if (event.retried) details.push('retry');
    console.log(details.join(' | '));
    return;
  }
  if (event.status === 'error') {
    console.log(`falhou: ${event.error}`);
    return;
  }
  if (event.status === 'rescue') {
    console.log(`  Nenhuma matéria passou do corte ${event.threshold}; usando ${event.count} classificadas pelo Ollama como resgate.`);
    return;
  }
  if (event.status === 'category-rescue') {
    console.log(`  ${event.category}: +${event.count} candidata(s) de reserva (mínimo ${event.floor.toFixed(1)}); total ${event.total}.`);
  }
}

function latestRedirectHtml(editionDate) {
  const target = `./${editionDate}/index.html`;
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>${publication.name}</title><p><a href="${target}">Open latest edition</a></p>`;
}

async function writeExports(edition, editionDir) {
  const files = {};
  if (config.exportMarkdown) {
    files.markdown = path.join(editionDir, 'edition.md');
    await fs.writeFile(files.markdown, renderMarkdown(edition), 'utf8');
    await fs.writeFile(path.join(config.outputDir, 'latest.md'), renderMarkdown(edition), 'utf8');
  }
  if (config.exportEmail) {
    files.email = path.join(editionDir, 'email.html');
    const email = renderEmailHtml(edition);
    await fs.writeFile(files.email, email, 'utf8');
    await fs.writeFile(path.join(config.outputDir, 'latest-email.html'), email, 'utf8');
  }
  if (config.exportSocial) {
    files.telegram = path.join(editionDir, 'telegram.txt');
    files.discord = path.join(editionDir, 'discord.md');
    const social = renderSocialText(edition);
    const discord = renderDiscordMarkdown(edition);
    await Promise.all([
      fs.writeFile(files.telegram, social, 'utf8'),
      fs.writeFile(files.discord, discord, 'utf8'),
      fs.writeFile(path.join(config.outputDir, 'latest-telegram.txt'), social, 'utf8'),
      fs.writeFile(path.join(config.outputDir, 'latest-discord.md'), discord, 'utf8')
    ]);
  }
  return files;
}

async function main() {
  const editionDate = dateKey();
  const plugins = await loadPlugins();
  console.log(`\n${publication.name.toUpperCase()}`);
  console.log(`Edição: ${editionDate}`);
  console.log(`Preset: ${editorial.preset} · Perfil: ${profile.name} · ${categories.length} categorias`);
  console.log(`Idioma: ${config.language} · Contexto: ${config.editorialContext}`);
  if (plugins.length) console.log(`Plugins: ${plugins.map(plugin => plugin.name).join(', ')}`);
  console.log('');

  process.stdout.write('1/7 Verificando Ollama... ');
  await ensureOllama();
  console.log('ok');

  if (config.historyEnabled) await pruneHistory(config.historyDays);

  console.log('2/7 Coletando feeds e eliminando repetição histórica...');
  const collected = await fetchAllFeeds(({ index, total, feed }) => {
    process.stdout.write(`  [${index}/${total}] ${feed}\n`);
  });
  let collectState = await runPluginHook(plugins, 'afterCollect', { ...collected, editionDate });
  let articles = Array.isArray(collectState?.articles) ? collectState.articles : collected.articles;
  const historyFiltered = await filterPreviouslyPublished(articles);
  articles = historyFiltered.articles;

  console.log(`  ${collected.articles.length} matérias recentes elegíveis coletadas.`);
  if (collected.imageRejected > 0) console.log(`  ${collected.imageRejected} sem imagem válida foram descartadas antes da IA.`);
  if (historyFiltered.rejected.length) console.log(`  ${historyFiltered.rejected.length} história(s) já cobertas recentemente foram removidas pela memória local.`);
  if (collected.errors.length) console.log(`  ${collected.errors.length} fonte(s) falharam e foram ignoradas.`);
  if (!articles.length) throw new Error('Nenhuma matéria nova elegível restou após coleta e memória histórica.');

  console.log(`3/7 Ollama analisando e filtrando... corte inicial ${config.llmMinScore}/10`);
  let analyzed = await analyzeArticles(articles, logAnalysisProgress);
  if (!analyzed.length) throw new Error('O Ollama respondeu, mas nenhuma matéria pôde ser interpretada como candidata válida.');

  const semantic = deduplicateArticles(analyzed, config.duplicateThreshold);
  analyzed = semantic.articles;
  let analyzedState = await runPluginHook(plugins, 'afterAnalyze', { articles: analyzed, editionDate });
  analyzed = Array.isArray(analyzedState?.articles) ? analyzedState.articles : analyzed;
  if (semantic.duplicates.length) console.log(`  ${semantic.duplicates.length} duplicata(s) semântica(s) consolidadas.`);
  console.log(`  ${analyzed.length} matérias seguem para o editor-chefe.`);

  console.log('4/7 Montando a newsletter e aplicando diversidade editorial...');
  let edition;
  try {
    const curated = await curateNewsletter(analyzed, editionDate);
    edition = normalizeNewsletter(curated, analyzed, editionDate);
  } catch (error) {
    console.log(`  Editor-chefe falhou (${error.message}). Usando ranking como fallback.`);
    edition = fallbackNewsletter(analyzed, editionDate);
  }
  if (!edition.lead) throw new Error('Não foi possível escolher uma manchete para a edição.');
  edition.stats.historyRejected = historyFiltered.rejected.length;
  edition.stats.semanticDuplicates = semantic.duplicates.length;
  console.log(`  ${sectionReport(edition)}`);
  if (edition.stats.backfilled) console.log(`  ${edition.stats.backfilled} vaga(s) completadas automaticamente.`);
  if (edition.stats.diversityRelaxed) console.log(`  ${edition.stats.diversityRelaxed} vaga(s) precisaram relaxar o limite de fonte para manter a quantidade.`);
  if (edition.stats.leadRebalanced) console.log('  Manchete reequilibrada para preservar as seções.');

  console.log('5/7 Baixando imagens selecionadas para a edição...');
  const editionDir = path.join(config.outputDir, editionDate);
  await fs.mkdir(editionDir, { recursive: true });
  const imageResult = await cacheEditionImages(edition, editionDir);
  edition = imageResult.edition;
  edition.stats.imagesCached = imageResult.cached;
  edition.stats.imageCacheFailures = imageResult.failed;
  console.log(`  ${imageResult.cached} imagem(ns) cacheadas localmente${imageResult.failed ? ` · ${imageResult.failed} fallback(s) remoto(s)` : ''}.`);

  const renderState = await runPluginHook(plugins, 'beforeRender', { edition, editionDir });
  if (renderState?.edition) edition = renderState.edition;

  console.log('6/7 Gerando HTML, JSON, PDF e formatos auxiliares...');
  const logoDataUri = await loadLogoDataUri();
  const html = renderNewsletterHtml(edition, logoDataUri);
  const pdf = await renderHtmlPdf(html, { baseDir: editionDir });

  const htmlPath = path.join(editionDir, 'index.html');
  const jsonPath = path.join(editionDir, 'edition.json');
  const pdfPath = path.join(editionDir, `${publication.slug}-${editionDate}.pdf`);
  const latestPdf = path.join(config.outputDir, `${publication.slug}-latest.pdf`);
  await Promise.all([
    fs.writeFile(htmlPath, html, 'utf8'),
    fs.writeFile(jsonPath, JSON.stringify(edition, null, 2), 'utf8'),
    fs.writeFile(pdfPath, pdf),
    fs.writeFile(path.join(config.outputDir, 'latest.html'), latestRedirectHtml(editionDate), 'utf8'),
    fs.writeFile(path.join(config.outputDir, 'latest.json'), JSON.stringify(edition, null, 2), 'utf8'),
    fs.writeFile(latestPdf, pdf)
  ]);
  const exportPaths = await writeExports(edition, editionDir);

  console.log('7/7 Atualizando memória, arquivo histórico e plugins...');
  const remembered = await rememberEdition(edition);
  const archivePath = await updateArchive(config.outputDir);
  const paths = { html: htmlPath, json: jsonPath, pdf: pdfPath, latestPdf, archive: archivePath, ...exportPaths };
  await runPluginExporters(plugins, { edition, editionDir, paths, config });
  await runPluginHook(plugins, 'afterWrite', { edition, editionDir, paths });
  if (config.historyEnabled) console.log(`  ${remembered} história(s) registradas na memória local.`);

  console.log('\nPronto.');
  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF:  ${pdfPath}`);
  console.log(`JSON: ${jsonPath}`);
  if (archivePath) console.log(`Arquivo: ${archivePath}`);
  console.log('');
  await openFile(htmlPath);
}

main().catch(error => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
