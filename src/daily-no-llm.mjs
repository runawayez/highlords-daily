import fs from 'node:fs/promises';
import path from 'node:path';
import { config, noLlmFeeds } from './config.mjs';
import { fetchAllFeeds } from './services/rss.mjs';
import { analyzeWithRules, buildRulesNewsletter } from './services/rules.mjs';
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

async function loadLogoDataUri() {
  try {
    const logoPath = path.resolve('public/assets/highlords-logo.svg');
    const svg = await fs.readFile(logoPath);
    return `data:image/svg+xml;base64,${svg.toString('base64')}`;
  } catch {
    return '';
  }
}

function sectionReport(edition) {
  return edition.sections.map(section => `${section.name}: ${section.articles.length}`).join(' | ');
}

async function main() {
  const editionDate = dateKey();
  console.log('\nHIGH LORDS DAILY — MODO SEM LLM');
  console.log(`Edição: ${editionDate}\n`);

  console.log('1/4 Coletando fontes em português...');
  const { articles, errors } = await fetchAllFeeds(({ index, total, feed }) => {
    process.stdout.write(`  [${index}/${total}] ${feed}\n`);
  }, noLlmFeeds);
  console.log(`  ${articles.length} matérias recentes encontradas.`);
  if (errors.length) {
    console.log(`  ${errors.length} fonte(s) falharam e foram ignoradas:`);
    errors.forEach(error => console.log(`  - ${error}`));
  }
  if (!articles.length) throw new Error('Nenhuma matéria recente foi encontrada nos feeds em português.');

  console.log('2/4 Aplicando idioma, qualidade, categoria, score e deduplicação...');
  const { approved, rejected } = analyzeWithRules(articles);
  console.log(`  ${approved.length} aprovadas | ${rejected.length} rejeitadas.`);
  if (!approved.length) throw new Error('Nenhuma matéria passou pela curadoria sem LLM.');

  console.log('3/4 Montando edição com diversidade de categorias e fontes...');
  const edition = buildRulesNewsletter(approved, editionDate);
  console.log(`  ${sectionReport(edition)}`);

  console.log('4/4 Gerando newsletter visual em HTML, JSON e PDF...');
  const editionDir = path.join(config.outputDir, editionDate, 'no-llm');
  await fs.mkdir(editionDir, { recursive: true });
  await fs.mkdir(config.outputDir, { recursive: true });

  const logoDataUri = await loadLogoDataUri();
  const html = renderNewsletterHtml(edition, logoDataUri);
  const pdf = await renderHtmlPdf(html);
  const diagnostics = {
    editionDate,
    mode: 'rules',
    collected: articles.length,
    approved: approved.length,
    rejected: rejected.length,
    rejectionReasons: rejected.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {}),
    selected: edition.stats.stories,
    sources: noLlmFeeds.map(feed => feed.name),
    generatedAt: edition.generatedAt
  };

  const htmlPath = path.join(editionDir, 'index.html');
  const jsonPath = path.join(editionDir, 'edition.json');
  const diagnosticsPath = path.join(editionDir, 'diagnostics.json');
  const pdfPath = path.join(editionDir, `highlords-daily-${editionDate}-no-llm.pdf`);

  await Promise.all([
    fs.writeFile(htmlPath, html, 'utf8'),
    fs.writeFile(jsonPath, JSON.stringify(edition, null, 2), 'utf8'),
    fs.writeFile(diagnosticsPath, JSON.stringify(diagnostics, null, 2), 'utf8'),
    fs.writeFile(pdfPath, pdf),
    fs.writeFile(path.join(config.outputDir, 'latest-no-llm.html'), html, 'utf8'),
    fs.writeFile(path.join(config.outputDir, 'latest-no-llm.json'), JSON.stringify(edition, null, 2), 'utf8'),
    fs.writeFile(path.join(config.outputDir, 'highlords-daily-no-llm-latest.pdf'), pdf)
  ]);

  console.log('\nPronto — nenhuma LLM foi usada.');
  console.log(`HTML: ${htmlPath}`);
  console.log(`PDF:  ${pdfPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Diag: ${diagnosticsPath}\n`);
}

main().catch(error => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
