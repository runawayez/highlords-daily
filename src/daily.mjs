import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { categories, config } from './config.mjs';
import { fetchAllFeeds } from './services/rss.mjs';
import { analyzeArticles, curateNewsletter, ensureOllama } from './services/ollama.mjs';
import { renderDailyPdf } from './services/pdf.mjs';
import { renderNewsletterHtml } from './template.mjs';

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function normalizeNewsletter(curated, articles, editionDate) {
  const byId = new Map(articles.map(article => [Number(article.id), article]));
  const used = new Set();
  const requestedLead = byId.get(Number(curated?.leadId));
  const lead = requestedLead || articles[0] || null;
  if (lead) used.add(lead.id);

  const sections = categories.map(category => {
    const requested = Array.isArray(curated?.sections?.[category.slug]) ? curated.sections[category.slug] : [];
    const selected = [];

    for (const rawId of requested) {
      const article = byId.get(Number(rawId));
      if (!article || article.category !== category.slug || used.has(article.id)) continue;
      used.add(article.id);
      selected.push(article);
      if (selected.length >= config.itemsPerCategory) break;
    }

    return { slug: category.slug, name: category.name, articles: selected };
  });

  const chosen = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: 'ollama',
    title: String(curated?.title || 'O que vale sua atenção hoje').trim().slice(0, 120),
    intro: String(curated?.intro || 'Uma seleção curta das atualizações mais relevantes em tecnologia, sem política e sem excesso de ruído.').trim().slice(0, 420),
    lead,
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(chosen.map(article => article.source)).size,
      candidates: articles.length
    }
  };
}

function fallbackNewsletter(articles, editionDate) {
  const lead = articles[0] || null;
  const used = new Set(lead ? [lead.id] : []);
  const sections = categories.map(category => {
    const selected = articles
      .filter(article => article.category === category.slug && !used.has(article.id))
      .slice(0, config.itemsPerCategory);
    selected.forEach(article => used.add(article.id));
    return { slug: category.slug, name: category.name, articles: selected };
  });
  const chosen = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: 'ranking',
    title: 'O que vale sua atenção hoje',
    intro: 'Uma seleção curta das atualizações mais relevantes em tecnologia, sem política e sem excesso de ruído.',
    lead,
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(chosen.map(article => article.source)).size,
      candidates: articles.length
    }
  };
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

async function main() {
  const editionDate = dateKey();
  console.log('\nHIGH LORDS DAILY');
  console.log(`Edição: ${editionDate}\n`);

  process.stdout.write('1/5 Verificando Ollama... ');
  await ensureOllama();
  console.log('ok');

  console.log('2/5 Coletando feeds...');
  const { articles, errors } = await fetchAllFeeds(({ index, total, feed }) => {
    process.stdout.write(`  [${index}/${total}] ${feed}\n`);
  });
  console.log(`  ${articles.length} matérias recentes encontradas.`);
  if (errors.length) {
    console.log(`  ${errors.length} fonte(s) falharam e foram ignoradas.`);
  }
  if (!articles.length) throw new Error('Nenhuma matéria recente foi encontrada nos feeds.');

  console.log('3/5 Ollama analisando e filtrando...');
  const analyzed = await analyzeArticles(articles, ({ batch, totalBatches }) => {
    process.stdout.write(`  lote ${batch}/${totalBatches}\n`);
  });
  if (!analyzed.length) throw new Error('Nenhuma matéria atingiu o nível mínimo de relevância para a edição.');
  console.log(`  ${analyzed.length} matérias aprovadas pela curadoria inicial.`);

  console.log('4/5 Montando a newsletter...');
  let edition;
  try {
    const curated = await curateNewsletter(analyzed, editionDate);
    edition = normalizeNewsletter(curated, analyzed, editionDate);
  } catch (error) {
    console.log(`  Editor-chefe falhou (${error.message}). Usando ranking como fallback.`);
    edition = fallbackNewsletter(analyzed, editionDate);
  }
  if (!edition.lead) throw new Error('Não foi possível escolher uma manchete para a edição.');

  console.log('5/5 Gerando HTML, JSON e PDF...');
  const editionDir = path.join(config.outputDir, editionDate);
  await fs.mkdir(editionDir, { recursive: true });
  const logoDataUri = await loadLogoDataUri();
  const html = renderNewsletterHtml(edition, logoDataUri);
  const pdf = await renderDailyPdf(edition);

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
