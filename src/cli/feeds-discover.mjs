import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import Parser from 'rss-parser';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'HighlordsDaily/4.0 (+https://github.com/runawayez/highlords-daily)'
  }
});

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const quietMode = args.includes('--quiet');

function flagValue(name) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return null;
}

const appendFile = flagValue('--append');
const positional = args.filter((arg, index) => {
  if (arg.startsWith('--')) return false;
  const previous = args[index - 1];
  return previous !== '--append';
});

function normalizeTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return null;
  }
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1]?.trim() || null;
}

function discoverFromHtml(html, baseUrl) {
  const urls = [];
  for (const match of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const type = (attr(tag, 'type') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href || !rel.split(/\s+/).includes('alternate')) continue;
    if (!/(application\/(rss|atom)\+xml|text\/xml|application\/xml)/i.test(type)) continue;
    try { urls.push(new URL(href, baseUrl).toString()); } catch {}
  }
  return urls;
}

function commonCandidates(siteUrl) {
  const origin = new URL(siteUrl).origin;
  const paths = [
    '/feed', '/feed/', '/rss', '/rss/', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml',
    '/feeds/posts/default?alt=rss', '/feeds/posts/default?alt=atom'
  ];
  return paths.map(candidate => new URL(candidate, origin).toString());
}

async function fetchText(url, accept = '*/*') {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 HighlordsDaily/4.0',
      accept
    },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { text: await response.text(), finalUrl: response.url || url, type: response.headers.get('content-type') || '' };
}

async function validateFeed(url) {
  try {
    const { text, finalUrl } = await fetchText(url, 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.5');
    const feed = await parser.parseString(text);
    const items = Array.isArray(feed.items) ? feed.items.length : 0;
    if (!feed.title && items === 0) return null;
    return {
      url: finalUrl,
      title: String(feed.title || new URL(finalUrl).hostname).trim(),
      items
    };
  } catch {
    return null;
  }
}

async function discover(target) {
  const siteUrl = normalizeTarget(target);
  if (!siteUrl) return { target, siteUrl: null, feeds: [], error: 'URL inválida' };

  const candidates = new Set([siteUrl]);
  let finalSiteUrl = siteUrl;
  let homepageError = null;

  try {
    const page = await fetchText(siteUrl, 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,*/*;q=0.4');
    finalSiteUrl = page.finalUrl;
    for (const feedUrl of discoverFromHtml(page.text.slice(0, 750_000), finalSiteUrl)) candidates.add(feedUrl);
  } catch (error) {
    homepageError = error.message || String(error);
  }

  for (const candidate of commonCandidates(finalSiteUrl)) candidates.add(candidate);

  const feeds = [];
  const seen = new Set();
  for (const candidate of [...candidates].slice(0, 20)) {
    const valid = await validateFeed(candidate);
    if (!valid || seen.has(valid.url)) continue;
    seen.add(valid.url);
    feeds.push(valid);
    if (feeds.length >= 8) break;
  }

  return {
    target,
    siteUrl: finalSiteUrl,
    feeds,
    error: feeds.length ? null : homepageError || 'Nenhum RSS/Atom válido encontrado'
  };
}

function yamlFeed(feed) {
  return {
    name: feed.title,
    url: feed.url,
    focus: []
  };
}

async function appendFeeds(filePath, discovered) {
  const absolute = path.resolve(filePath);
  let document = { version: 1, preset: 'custom', feeds: [] };
  try {
    document = parseYaml(await fs.readFile(absolute, 'utf8')) || document;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (!Array.isArray(document.feeds)) document.feeds = [];
  const existing = new Set(document.feeds.map(feed => String(feed?.url || '').trim()).filter(Boolean));
  let added = 0;
  for (const feed of discovered) {
    if (existing.has(feed.url)) continue;
    document.feeds.push(yamlFeed(feed));
    existing.add(feed.url);
    added += 1;
  }

  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, stringifyYaml(document, { lineWidth: 0 }), 'utf8');
  return { file: absolute, added };
}

async function main() {
  let targets = positional.map(normalizeTarget).filter(Boolean);

  if (!targets.length) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Sites/domínios para descobrir RSS (separe por espaço ou vírgula): ');
    rl.close();
    targets = answer.split(/[\s,]+/).map(normalizeTarget).filter(Boolean);
  }

  if (!targets.length) throw new Error('Informe pelo menos um site ou domínio.');

  const results = [];
  for (const target of targets) {
    if (!jsonMode && !quietMode) process.stdout.write(`Procurando feeds em ${target}... `);
    const result = await discover(target);
    results.push(result);
    if (!jsonMode && !quietMode) console.log(result.feeds.length ? `${result.feeds.length} encontrado(s)` : 'nenhum');
  }

  const discovered = results.flatMap(result => result.feeds);
  const unique = [...new Map(discovered.map(feed => [feed.url, feed])).values()];

  let appended = null;
  if (appendFile && unique.length) appended = await appendFeeds(appendFile, unique);

  if (jsonMode) {
    console.log(JSON.stringify({ results, discovered: unique, appended }, null, 2));
    return;
  }

  console.log('');
  for (const result of results) {
    console.log(result.siteUrl || result.target);
    if (!result.feeds.length) {
      console.log(`  - ${result.error || 'Nenhum feed encontrado'}`);
      continue;
    }
    for (const feed of result.feeds) {
      console.log(`  ✓ ${feed.title} — ${feed.url} (${feed.items} itens lidos)`);
    }
  }

  if (unique.length) {
    console.log('\nYAML sugerido:\n');
    console.log(stringifyYaml({ feeds: unique.map(yamlFeed) }, { lineWidth: 0 }).trim());
  }

  if (appended) console.log(`\n${appended.added} feed(s) adicionados em ${appended.file}.`);
  if (!unique.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
