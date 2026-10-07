import { categories, feeds, config, editorial } from '../config.mjs';
import { fetchAllFeeds } from '../services/rss.mjs';

const jsonMode = process.argv.includes('--json');
const results = [];

if (!jsonMode) {
  console.log('\nHIGH LORDS DAILY — FEED CHECK');
  console.log(`Preset: ${editorial.preset} · ${feeds.length} fontes · janela ${config.lookbackHours}h\n`);
}

for (const feed of feeds) {
  const started = Date.now();
  const result = await fetchAllFeeds(() => {}, [feed]);
  const elapsedMs = Date.now() - started;
  const row = {
    name: feed.name,
    url: feed.url,
    focus: feed.focus,
    ok: result.errors.length === 0,
    recentWithImage: result.articles.length,
    imageRejected: result.imageRejected || 0,
    elapsedMs,
    error: result.errors[0] || null
  };
  results.push(row);

  if (!jsonMode) {
    const status = row.ok ? 'OK ' : 'ERR';
    const count = `${row.recentWithImage} válidas`;
    const rejected = row.imageRejected ? ` · ${row.imageRejected} sem imagem` : '';
    console.log(`${status}  ${feed.name.padEnd(32)} ${count}${rejected} · ${elapsedMs}ms${row.error ? ` · ${row.error}` : ''}`);
  }
}

const categoryCoverage = categories.map(category => {
  const sourceRows = results.filter(row => row.focus.includes(category.slug));
  const healthyRows = sourceRows.filter(row => row.ok && row.recentWithImage > 0);
  return {
    slug: category.slug,
    name: category.name,
    configuredSources: sourceRows.length,
    healthySources: healthyRows.length,
    recentCandidates: healthyRows.reduce((sum, row) => sum + row.recentWithImage, 0),
    sources: sourceRows.map(row => row.name),
    healthy: healthyRows.map(row => row.name)
  };
});

if (jsonMode) {
  console.log(JSON.stringify({ preset: editorial.preset, results, categoryCoverage }, null, 2));
} else {
  const healthy = results.filter(row => row.ok && row.recentWithImage > 0).length;
  console.log(`\n${healthy}/${results.length} fontes retornaram matérias elegíveis.`);
  console.log('\nCobertura potencial por categoria:');
  for (const row of categoryCoverage) {
    const status = row.healthySources > 0 ? 'OK ' : 'WARN';
    console.log(`${status}  ${row.name.padEnd(22)} ${row.healthySources}/${row.configuredSources} fontes ativas · ${row.recentCandidates} candidatas recentes`);
  }
  console.log('');
}

if (results.every(row => !row.ok)) process.exitCode = 1;
