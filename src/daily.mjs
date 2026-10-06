import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { categories, config, editorial } from './config.mjs';
import { fetchAllFeeds } from './services/rss.mjs';
import { analyzeArticles, curateNewsletter, ensureOllama } from './services/ollama.mjs';
import { renderHtmlPdf } from './services/html-pdf.mjs';
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

  if (canSpareForLead(requestedLead)) {
    return { lead: requestedLead, rebalanced: false };
  }

  const alternative = articles.find(canSpareForLead);
  if (alternative) {
    return {
      lead: alternative,
      rebalanced: Boolean(requestedLead && alternative.id !== requestedLead.id)
    };
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

function normalizeNewsletter(curated, articles, editionDate) {
  const byId = new Map(articles.map(article => [Number(article.id), article]));
  const used = new Set();
  const requestedLeadId = curatedId(curated?.leadId ?? curated?.lead ?? curated?.headlineId ?? curated?.mancheteId);
  const requestedLead = requestedLeadId != null ? byId.get(requestedLeadId) : null;
  const { lead, rebalanced: leadRebalanced } = chooseLead(requestedLead, articles);
  if (lead) used.add(lead.id);

  let backfilled = 0;
  const sections = categories.map(category => {
    const requested = Array.isArray(curated?.sections?.[category.slug]) ? curated.sections[category.slug] : [];
    const selected = [];

    for (const rawValue of requested) {
      const id = curatedId(rawValue);
      if (id == null) continue;
      const article = byId.get(id);
      if (!article || article.category !== category.slug || used.has(article.id)) continue;
      used.add(article.id);
      selected.push(article);
      if (selected.length >= config.itemsPerCategory) break;
    }

    if (selected.length < config.itemsPerCategory) {
      const candidates = articles.filter(article =>
        article.category === category.slug && !used.has(article.id)
      );

      for (const article of candidates) {
        used.add(article.id);
        selected.push(article);
        backfilled += 1;
        if (selected.length >= config.itemsPerCategory) break;
      }
    }

    return {
      slug: category.slug,
      name: localizedSectionName(curated, category),
      articles: selected
    };
  });

  const chosen = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  const fallback = fallbackCopy();
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: 'ollama',
    selectionMode: backfilled > 0 ? 'ollama+section-backfill' : 'ollama',
    preset: editorial.preset,
    language: config.language,
    editorialContext: config.editorialContext,
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
      leadRebalanced
    }
  };
}

function fallbackNewsletter(articles, editionDate) {
  const { lead, rebalanced: leadRebalanced } = chooseLead(articles[0] || null, articles);
  const used = new Set(lead ? [lead.id] : []);
  const sections = categories.map(category => {
    const selected = articles
      .filter(article => article.category === category.slug && !used.has(article.id))
      .slice(0, config.itemsPerCategory);
    selected.forEach(article => used.add(article.id));
    return { slug: category.slug, name: category.name, articles: selected };
  });
  const chosen = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  const fallback = fallbackCopy();
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: 'ollama',
    selectionMode: 'ranking-fallback',
    preset: editorial.preset,
    language: config.language,
    editorialContext: config.editorialContext,
    title: fallback.title,
    intro: fallback.intro,
    ui: {},
    lead,
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(chosen.map(article => article.source)).size,
      candidates: articles.length,
      leadRebalanced
    }
  };
}

function sectionReport(edition) {
  return edition.sections.map(section => `${section.name}: ${section.articles.length}`).join(' | ');
}

async function openFile(filePath) {
  if (!config.autoOpen) return;
  const absolute = path.resolve(filePath);
  try {
    let child;
    if (process.platform === 'win32') {
      child = spawn('cmd.exe', ['/c', 'start', '', absolute], { detached: true, stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      child = spawn('open', [absolute], { detached: true, stdio: 'ignore' });
    } else {
      child = spawn('xdg-open', [absolute], { detached: true, stdio: 'ignore' });
    }
    child.unref();
  } catch {}
}

async function loadLogoDataUri() {
  try {
    const logoPath = path.resolve('public/assets/highlords-logo.svg');
    const svg = await fs.readFile(logoPath);
    return `data:image/svg+xml;base64,${svg.toString('base64')}`;
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
    console.log(`  Nenhuma matéria passou do corte ${event.threshold}; usando ${event.count} classificadas pelo Ollama como resgate para o editor-chefe.`);
    return;
  }

  if (event.status === 'category-rescue') {
    console.log(`  ${event.category}: +${event.count} candidata(s) de reserva (mínimo ${event.floor.toFixed(1)}) para padronizar a seção; total ${event.total}.`);
  }
}

async function main() {
  const editionDate = dateKey();
  console.log('\nHIGH LORDS DAILY');
  console.log(`Edição: ${editionDate}`);
  console.log(`Preset: ${editorial.preset} · ${categories.length} categorias`);
  console.log(`Idioma: ${config.language} · Contexto: ${config.editorialContext}\n`);

  process.stdout.write('1/5 Verificando Ollama... ');
  await ensureOllama();
  console.log('ok');

  console.log('2/5 Coletando feeds...');
  const { articles, errors, imageRejected = 0 } = await fetchAllFeeds(({ index, total, feed }) => {
    process.stdout.write(`  [${index}/${total}] ${feed}\n`);
  });
  console.log(`  ${articles.length} matérias recentes com imagem válida encontradas.`);
  if (config.requireImages && imageRejected > 0) {
    console.log(`  ${imageRejected} matéria(s) sem imagem válida foram descartadas antes da IA.`);
  }
  if (errors.length) {
    console.log(`  ${errors.length} fonte(s) falharam e foram ignoradas.`);
  }
  if (!articles.length) throw new Error('Nenhuma matéria recente com imagem válida foi encontrada nos feeds.');

  console.log(`3/5 Ollama analisando e filtrando... corte inicial ${config.llmMinScore}/10`);
  const analyzed = await analyzeArticles(articles, logAnalysisProgress);
  if (!analyzed.length) {
    throw new Error('O Ollama respondeu, mas nenhuma matéria pôde ser interpretada como candidata válida. Rode novamente e confira os diagnósticos dos lotes acima.');
  }
  console.log(`  ${analyzed.length} matérias seguem para o editor-chefe.`);

  console.log('4/5 Montando a newsletter...');
  let edition;
  try {
    const curated = await curateNewsletter(analyzed, editionDate);
    edition = normalizeNewsletter(curated, analyzed, editionDate);
  } catch (error) {
    console.log(`  Editor-chefe falhou (${error.message}). Usando ranking como fallback sobre matérias já analisadas pelo Ollama.`);
    edition = fallbackNewsletter(analyzed, editionDate);
  }
  if (!edition.lead) throw new Error('Não foi possível escolher uma manchete para a edição.');
  console.log(`  ${sectionReport(edition)}`);
  if (edition.stats?.backfilled) {
    console.log(`  ${edition.stats.backfilled} vaga(s) de seção completadas automaticamente com candidatas já aprovadas pelo Ollama.`);
  }
  if (edition.stats?.leadRebalanced) {
    console.log('  Manchete reequilibrada para preservar a quantidade padrão de destaques nas seções.');
  }

  console.log('5/5 Gerando HTML, JSON e PDF visual...');
  const editionDir = path.join(config.outputDir, editionDate);
  await fs.mkdir(editionDir, { recursive: true });
  const logoDataUri = await loadLogoDataUri();
  const html = renderNewsletterHtml(edition, logoDataUri);
  const pdf = await renderHtmlPdf(html);

  const htmlPath = path.join(editionDir, 'index.html');
  const jsonPath = path.join(editionDir, 'edition.json');
  const pdfPath = path.join(editionDir, `highlords-daily-${editionDate}.pdf`);
  await Promise.all([
    fs.writeFile(htmlPath, html, 'utf8'),
    fs.writeFile(jsonPath, JSON.stringify(edition, null, 2), 'utf8'),
    fs.writeFile(pdfPath, pdf),
    fs.writeFile(path.join(config.outputDir, 'latest.html'), html, 'utf8'),
    fs.writeFile(path.join(config.outputDir, 'latest.json'), JSON.stringify(edition, null, 2), 'utf8'),
    fs.writeFile(path.join(config.outputDir, 'highlords-daily-latest.pdf'), pdf)
  ]);

  console.log('\nPronto.');
  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF:  ${pdfPath}`);
  console.log(`JSON: ${jsonPath}\n`);
  await openFile(htmlPath);
}

main().catch(error => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
