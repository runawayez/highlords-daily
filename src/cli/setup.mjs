import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

async function ask(label, fallback = '') {
  const suffix = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}

async function choose(label, options, fallback) {
  output.write(`\n${label}\n`);
  options.forEach((option, index) => output.write(`  ${index + 1}. ${option.label}\n`));
  const defaultIndex = Math.max(0, options.findIndex(option => option.value === fallback));
  const raw = await ask('Escolha', String(defaultIndex + 1));
  const index = Math.max(0, Math.min(options.length - 1, Number(raw) - 1));
  return options[index].value;
}

function envValue(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

try {
  output.write('\nHIGH LORDS DAILY — SETUP\n');
  output.write('Cria um .env local sem alterar o preset Vanilla do repositório.\n');

  const preset = await choose('Preset', [
    { value: 'br', label: 'BR / Vanilla — fontes brasileiras, pt-BR' },
    { value: 'global', label: 'Global — fontes brasileiras + internacionais' },
    { value: 'custom', label: 'Custom — seus próprios YAMLs' }
  ], 'br');

  const defaults = preset === 'br'
    ? { language: 'pt-BR', context: 'Brasil', timezone: 'America/Sao_Paulo' }
    : { language: 'en-US', context: 'Global', timezone: 'UTC' };

  const language = await ask('Idioma/locale da edição', defaults.language);
  const context = await ask('Contexto editorial do leitor', defaults.context);
  const timezone = await ask('Timezone IANA', defaults.timezone);
  const profile = await choose('Perfil editorial', [
    { value: 'balanced', label: 'Balanced — equilíbrio geral' },
    { value: 'tech-heavy', label: 'Tech Heavy — tecnologia em primeiro plano' },
    { value: 'business', label: 'Business — economia e negócios' },
    { value: 'gaming', label: 'Gaming — games e hardware' },
    { value: 'minimal', label: 'Minimal — edição mais curta' }
  ], 'balanced');

  const publicationName = await ask('Nome da publicação', 'Highlords Daily');
  const publicationTagline = await ask('Slogan/tagline (vazio = automático)', '');
  const itemsPerCategory = await ask('Destaques por categoria (1-3)', profile === 'minimal' ? '1' : '2');
  const model = await ask('Modelo Ollama', 'qwen3:4b');

  let categoriesFile = '';
  let feedsFile = '';
  if (preset === 'custom') {
    categoriesFile = await ask('Arquivo de categorias', './config/categories.yml');
    feedsFile = await ask('Arquivo de feeds', './config/feeds.yml');
  }

  const lines = [
    '# Gerado por npm run setup',
    `PRESET=${envValue(preset)}`,
    `LANGUAGE=${envValue(language)}`,
    `EDITORIAL_CONTEXT=${envValue(context)}`,
    `TIME_ZONE=${envValue(timezone)}`,
    `EDITORIAL_PROFILE=${envValue(profile)}`,
    `PUBLICATION_NAME=${envValue(publicationName)}`,
    publicationTagline ? `PUBLICATION_TAGLINE=${envValue(publicationTagline)}` : '# PUBLICATION_TAGLINE=',
    `OLLAMA_MODEL=${envValue(model)}`,
    `ITEMS_PER_CATEGORY=${envValue(itemsPerCategory)}`,
    'REQUIRE_IMAGES=true',
    'CACHE_IMAGES=true',
    'HISTORY_ENABLED=true',
    'ARCHIVE_ENABLED=true',
    'EXPORT_MARKDOWN=true',
    'EXPORT_EMAIL=true',
    'EXPORT_SOCIAL=true',
    'PLUGINS_ENABLED=true',
    'AUTO_OPEN=true'
  ];
  if (categoriesFile) lines.push(`CATEGORIES_FILE=${envValue(categoriesFile)}`);
  if (feedsFile) lines.push(`FEEDS_FILE=${envValue(feedsFile)}`);

  const target = path.resolve('.env');
  try {
    await fs.access(target);
    const overwrite = (await ask('.env já existe. Sobrescrever? (s/N)', 'N')).toLowerCase();
    if (!['s', 'sim', 'y', 'yes'].includes(overwrite)) {
      output.write('Setup cancelado; .env existente foi preservado.\n');
      process.exit(0);
    }
  } catch {}

  await fs.writeFile(target, `${lines.join('\n')}\n`, 'utf8');
  output.write(`\nPronto: ${target}\n`);
  output.write('Agora rode GERAR-DAILY.bat, bash RUN-DAILY.sh ou npm run daily.\n');
} finally {
  rl.close();
}
