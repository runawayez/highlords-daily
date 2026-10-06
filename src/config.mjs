import fs from 'node:fs';
import path from 'node:path';

if (fs.existsSync('.env') && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile('.env');
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export const categories = [
  ['ia', 'IA', 'Modelos, agentes, machine learning, OpenAI, Anthropic, Gemini e produtos cujo assunto principal seja inteligência artificial.'],
  ['desenvolvimento', 'Desenvolvimento', 'Programação, linguagens, frameworks, APIs, bancos, GitHub, QA, testes, DevOps, cloud e ferramentas para desenvolvedores.'],
  ['mobile-gadgets', 'Mobile & Gadgets', 'Smartphones, tablets, relógios, fones, smart home, acessórios e gadgets de consumo.'],
  ['hardware', 'Hardware', 'CPUs, GPUs, PCs, notebooks, monitores, periféricos, memória, armazenamento, chips e semicondutores.'],
  ['software-internet', 'Software & Internet', 'Sistemas operacionais, apps, browsers, serviços digitais, segurança, privacidade, web, redes e plataformas.'],
  ['games', 'Games', 'Jogos, consoles, Steam, PlayStation, Xbox, Nintendo, indies, RPGs, estúdios, engines e lançamentos.'],
  ['futuro', 'Futuro', 'Robótica, computação quântica, VR/AR, computação espacial, novas interfaces, protótipos e tecnologias emergentes.']
].map(([slug, name, description]) => ({ slug, name, description }));

// Fontes mistas usadas pelo modo com Ollama. A LLM consegue traduzir e filtrar conteúdo internacional.
export const feeds = [
  { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/' },
  { name: 'InfoQ', url: 'https://feed.infoq.com/' },
  { name: "Tom's Hardware", url: 'https://www.tomshardware.com/feeds/all' },
  { name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/feed' }
];

// O modo sem LLM não traduz. Por isso ele usa fontes em português e prefere deixar uma seção vazia
// a publicar títulos/resumos em inglês ou preencher espaço com conteúdo fraco.
export const noLlmFeeds = [
  { name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/' },
  { name: 'Canaltech', url: 'https://canaltech.com.br/rss/' },
  { name: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/' },
  { name: 'TecMundo', url: 'https://rss.tecmundo.com.br/feed' },
  { name: 'Oficina da Net', url: 'https://www.oficinadanet.com.br/rss/geral' },
  { name: 'TudoCelular', url: 'https://www.tudocelular.com/feed/' },
  { name: 'MacMagazine', url: 'https://macmagazine.com.br/feed/' },
  { name: 'Adrenaline', url: 'https://www.adrenaline.com.br/feed/' },
  { name: 'TabNews', url: 'https://www.tabnews.com.br/recentes/rss' }
];

export const config = {
  ollamaHost: (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:4b',
  timeZone: process.env.TIME_ZONE || 'America/Sao_Paulo',
  outputDir: path.resolve(process.env.OUTPUT_DIR || './output'),
  lookbackHours: Math.max(12, numberEnv('LOOKBACK_HOURS', 48)),
  maxItemsPerFeed: Math.max(3, numberEnv('MAX_ITEMS_PER_FEED', 12)),
  maxCandidates: Math.max(20, numberEnv('MAX_CANDIDATES', 72)),
  aiBatchSize: Math.max(4, Math.min(16, numberEnv('AI_BATCH_SIZE', 10))),
  itemsPerCategory: Math.max(1, Math.min(3, numberEnv('ITEMS_PER_CATEGORY', 2))),
  minScore: Math.max(0, Math.min(10, numberEnv('MIN_SCORE', 6))),
  autoOpen: booleanEnv('AUTO_OPEN', true)
};
