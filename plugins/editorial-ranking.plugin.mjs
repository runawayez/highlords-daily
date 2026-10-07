import fs from 'node:fs/promises';
import path from 'node:path';
import { config, profile } from '../src/config.mjs';

const STATE_FILE = path.join(config.dataDir, 'editorial-ranking-state.json');
const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','que','como','mais','menos','sobre','apos','após','the','a','an','of','to','in','on','for','and','or','with','from','by','is','are','new','after','before','says','diz','veja','entenda','hoje'
]);

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envBool(name, fallback = true) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

// Deep scan is part of the bundled editorial engine. It runs before collection
// because plugins are loaded before fetchAllFeeds() in daily.mjs.
if (envBool('EDITORIAL_DEEP_SCAN', true)) {
  config.maxItemsPerFeed = Math.max(config.maxItemsPerFeed, envNumber('EDITORIAL_DEEP_ITEMS_PER_FEED', 20));
  config.maxCandidates = Math.max(config.maxCandidates, envNumber('EDITORIAL_DEEP_MAX_CANDIDATES', 160));
  config.llmMinScore = Math.min(config.llmMinScore, envNumber('EDITORIAL_DEEP_LLM_MIN_SCORE', 4.0));
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value = '') {
  return new Set(normalize(value).split(' ').filter(token => token.length >= 3 && !STOPWORDS.has(token)));
}

function publisher(source = '') {
  return String(source).split('·')[0].trim().toLowerCase() || String(source).trim().toLowerCase();
}

function titleSimilarity(a, b) {
  const left = tokens(a?.originalTitle || a?.headline || '');
  const right = tokens(b?.originalTitle || b?.headline || '');
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  if (intersection < 3) return 0;
  const union = left.size + right.size - intersection;
  const jaccard = intersection / Math.max(1, union);
  const containment = intersection / Math.max(1, Math.min(left.size, right.size));
  return Math.max(jaccard, containment * 0.9);
}

function attachCoverageSignals(input = []) {
  const articles = input.map(article => ({ ...article }));
  const parent = articles.map((_, index) => index);
  const find = index => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent[right] = left;
  };

  for (let i = 0; i < articles.length; i += 1) {
    for (let j = i + 1; j < articles.length; j += 1) {
      if (publisher(articles[i].source) === publisher(articles[j].source)) continue;
      if (titleSimilarity(articles[i], articles[j]) >= 0.56) union(i, j);
    }
  }

  const groups = new Map();
  articles.forEach((article, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(article);
  });

  const coverageByLink = new Map();
  for (const group of groups.values()) {
    const sources = [...new Set(group.map(article => publisher(article.source)).filter(Boolean))];
    for (const article of group) {
      coverageByLink.set(article.link, {
        coverageCount: Math.max(1, sources.length),
        coverageSources: sources
      });
    }
  }

  return articles.map(article => ({
    ...article,
    ...(coverageByLink.get(article.link) || { coverageCount: 1, coverageSources: [publisher(article.source)] })
  }));
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function markEditionCycle(articles, state) {
  const previous = Date.parse(state?.lastSuccessfulEditionAt || '');
  if (!Number.isFinite(previous)) return articles.map(article => ({ ...article, newSinceLastEdition: true }));
  const overlapMs = envNumber('EDITORIAL_CYCLE_OVERLAP_HOURS', 3) * 60 * 60 * 1000;
  const threshold = previous - overlapMs;
  return articles.map(article => ({
    ...article,
    newSinceLastEdition: new Date(article.publishedAt || 0).getTime() >= threshold
  }));
}

function safeJson(content) {
  const cleaned = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('JSON inválido no ranking editorial.');
}

async function chatJson(system, user) {
  const response = await fetch(`${config.ollamaHost}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      think: false,
      format: 'json',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      options: { temperature: 0.05 }
    }),
    signal: AbortSignal.timeout(150000)
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const payload = await response.json();
  return safeJson(payload?.message?.content);
}

function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10, number)) : 0;
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function recencyScore(publishedAt) {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt || 0).getTime()) / 3600000);
  if (ageHours <= 3) return 10;
  if (ageHours <= 8) return 9.5;
  if (ageHours <= 16) return 8.5;
  if (ageHours <= 24) return 7.5;
  if (ageHours <= 36) return 6;
  if (ageHours <= 48) return 4.5;
  return 3;
}

function consensusScore(count) {
  const value = Number(count || 1);
  if (value >= 4) return 10;
  if (value === 3) return 8.5;
  if (value === 2) return 7;
  return 4;
}

function humanScore(dimensions) {
  return (
    clamp(dimensions.impact) * 0.28
    + clamp(dimensions.significance) * 0.28
    + clamp(dimensions.publicInterest) * 0.20
    + clamp(dimensions.novelty) * 0.14
    + clamp(dimensions.utility) * 0.10
  );
}

function rankScore(article, dimensions) {
  const base = humanScore(dimensions);
  const recency = recencyScore(article.publishedAt);
  const consensus = consensusScore(article.coverageCount);
  const cycle = article.newSinceLastEdition === false ? 5 : 10;
  const previous = clamp(article.score);
  return clamp(base * 0.72 + recency * 0.10 + consensus * 0.08 + cycle * 0.05 + previous * 0.05);
}

const rankingSystem = `Você é o editor de primeira página de um jornal diário. Sua tarefa NÃO é escolher categoria nem reescrever notícias: avalie a importância jornalística humana de cada matéria, em escala absoluta de 0 a 10.

Contexto do leitor: ${config.editorialContext}. Locale: ${config.language}. Perfil editorial: ${profile.name}.

Para CADA id, dê cinco notas:
- impact: consequência real e alcance do acontecimento;
- significance: raridade, peso histórico ou importância duradoura;
- publicInterest: quanto um leitor bem informado deveria saber disso hoje, não apenas curiosidade/clickbait;
- novelty: quão novo e materialmente diferente é o acontecimento;
- utility: utilidade prática ou capacidade de mudar uma decisão do leitor.

ÂNCORAS IMPORTANTES:
- 9–10 em significance deve ser raro: despedida/aposentadoria de figura histórica, título ou recorde extraordinário, morte de figura central, grande decisão regulatória/judicial, aquisição enorme, ruptura tecnológica, crise, desastre ou descoberta científica de grande peso;
- 7–8: desenvolvimento realmente grande ou relevante para muita gente;
- 4–6: notícia válida porém rotineira, resultado comum de jogo, promoção de produto, atualização pequena, rumor ou agenda;
- 0–3: detalhe menor, conteúdo promocional, curiosidade fraca ou assunto sem consequência;
- em esportes, um placar rotineiro NÃO vira 8 só porque envolve seleção ou time famoso. Despedida, aposentadoria, título, recorde, eliminação histórica ou transferência excepcional podem ser 8–10 conforme os fatos;
- fama de pessoa, clube, empresa ou marca não substitui importância do acontecimento;
- não invente contexto além do headline/summary fornecidos;
- coverageCount indica quantos veículos/publishers diferentes parecem cobrir o mesmo fato. Use isso apenas como evidência auxiliar; a fórmula final também tratará consenso separadamente.

Retorne SOMENTE JSON: {"items":[{"id":1,"impact":0,"significance":0,"publicInterest":0,"novelty":0,"utility":0}]}`;

async function evaluateBatch(batch) {
  const payload = batch.map(article => ({
    id: article.id,
    category: article.category,
    source: article.source,
    headline: article.headline || article.originalTitle,
    summary: article.summary || article.excerpt,
    publishedAt: article.publishedAt,
    coverageCount: article.coverageCount || 1,
    currentScore: article.score
  }));
  const parsed = await chatJson(rankingSystem, JSON.stringify(payload));
  return new Map(rowsFrom(parsed).map(row => [Number(row.id), row]));
}

const globalCalibrationSystem = `Você é o editor-chefe fechando a primeira página de um jornal diário. Compare as candidatas ENTRE SI e atribua priority de 0 a 10 para a importância relativa de HOJE.

Contexto do leitor: ${config.editorialContext}. Locale: ${config.language}. Perfil: ${profile.name}.

REGRAS:
- 9–10 é excepcional e deve ficar para acontecimentos realmente históricos, transformadores ou de enorme impacto;
- 7–8 é um grande destaque do dia;
- 4–6 é notícia válida e relevante, mas rotineira;
- 0–3 é pequena, promocional ou de baixo impacto;
- compare categorias diferentes sem favorecer esporte, tecnologia ou economia por padrão;
- em esporte, resultado rotineiro não deve liderar o jornal se houver despedida histórica, aposentadoria, título, recorde, eliminação histórica ou outro fato claramente maior;
- fama sozinha não basta; avalie o acontecimento;
- use preliminaryScore, dimensions, coverageCount e publishedAt apenas como sinais auxiliares;
- não invente fatos.

Retorne SOMENTE JSON: {"items":[{"id":1,"priority":0}]}`;

async function globalCalibrate(articles) {
  const limit = Math.max(12, Math.min(40, envNumber('EDITORIAL_GLOBAL_CALIBRATION_SIZE', 30)));
  const shortlist = articles.slice(0, limit);
  if (!shortlist.length) return articles;

  const payload = shortlist.map(article => ({
    id: article.id,
    category: article.category,
    headline: article.headline || article.originalTitle,
    summary: String(article.summary || article.excerpt || '').slice(0, 320),
    publishedAt: article.publishedAt,
    coverageCount: article.coverageCount || 1,
    preliminaryScore: article.score,
    dimensions: article.importance
  }));

  let priorities;
  try {
    const parsed = await chatJson(globalCalibrationSystem, JSON.stringify(payload));
    priorities = new Map(rowsFrom(parsed).map(row => [Number(row.id), clamp(row.priority)]));
  } catch (error) {
    console.warn(`  Calibração global caiu para o ranking dimensional (${error.message || error}).`);
    return articles;
  }

  return articles.map(article => {
    const priority = priorities.get(Number(article.id));
    if (priority == null) return article;
    const score = clamp(Number(article.score || 0) * 0.72 + priority * 0.28);
    return {
      ...article,
      score: Number(score.toFixed(2)),
      globalPriority: priority,
      rankingSignals: { ...(article.rankingSignals || {}), globalCalibration: priority }
    };
  }).sort((a, b) => Number(b.score) - Number(a.score) || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

async function applyHumanRanking(articles) {
  const result = [];
  const batchSize = Math.max(8, Math.min(20, envNumber('EDITORIAL_RANKING_BATCH_SIZE', 14)));

  for (let offset = 0; offset < articles.length; offset += batchSize) {
    const batch = articles.slice(offset, offset + batchSize);
    let evaluated = new Map();
    try {
      evaluated = await evaluateBatch(batch);
    } catch (error) {
      console.warn(`  Ranking humano: lote ${Math.floor(offset / batchSize) + 1} caiu para score anterior (${error.message || error}).`);
    }

    for (const article of batch) {
      const row = evaluated.get(Number(article.id));
      const fallback = clamp(article.score);
      const dimensions = row ? {
        impact: clamp(row.impact),
        significance: clamp(row.significance),
        publicInterest: clamp(row.publicInterest),
        novelty: clamp(row.novelty),
        utility: clamp(row.utility)
      } : {
        impact: fallback,
        significance: fallback,
        publicInterest: fallback,
        novelty: fallback,
        utility: fallback
      };
      const score = rankScore(article, dimensions);
      result.push({
        ...article,
        modelScore: article.score,
        score: Number(score.toFixed(2)),
        importance: dimensions,
        rankingSignals: {
          recency: recencyScore(article.publishedAt),
          consensus: consensusScore(article.coverageCount),
          coverageCount: article.coverageCount || 1,
          newSinceLastEdition: article.newSinceLastEdition !== false
        }
      });
    }
  }

  const dimensional = result.sort((a, b) => Number(b.score) - Number(a.score) || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return globalCalibrate(dimensional);
}

export default {
  name: 'Human Editorial Ranking',

  async afterCollect(payload) {
    const state = await readState();
    const withCoverage = attachCoverageSignals(Array.isArray(payload?.articles) ? payload.articles : []);
    const articles = markEditionCycle(withCoverage, state);
    const consensusStories = articles.filter(article => Number(article.coverageCount || 1) > 1).length;
    if (consensusStories) console.log(`  Ranking editorial: ${consensusStories} candidata(s) com sinal de cobertura por múltiplas fontes.`);
    return { ...payload, articles };
  },

  async afterAnalyze(payload) {
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    if (!articles.length) return payload;
    console.log(`  Ranking editorial humano: calibrando ${articles.length} matéria(s) por impacto, peso histórico, interesse, novidade e utilidade...`);
    const ranked = await applyHumanRanking(articles);
    const top = ranked.slice(0, 5).map(article => `${article.score.toFixed(2)} ${article.headline || article.originalTitle}`).join(' | ');
    if (top) console.log(`  Top editorial: ${top}`);
    return { ...payload, articles: ranked };
  },

  async afterWrite(payload) {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify({
      lastSuccessfulEditionAt: payload?.edition?.generatedAt || new Date().toISOString(),
      editionDate: payload?.edition?.editionDate || null
    }, null, 2), 'utf8');
    return payload;
  }
};
