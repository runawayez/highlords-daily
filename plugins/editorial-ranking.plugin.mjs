import fs from 'node:fs/promises';
import path from 'node:path';
import { config, profile } from '../src/config.mjs';

const STATE_FILE = path.join(config.dataDir, 'editorial-ranking-state.json');
const STOPWORDS = new Set([
  'a','o','as','os','um','uma','uns','umas','de','da','do','das','dos','e','em','no','na','nos','nas','para','por','com','sem','que','como','mais','menos','sobre','apos','the','an','of','to','in','on','for','and','or','with','from','by','is','are','new','after','before','says','diz','veja','entenda','hoje'
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
    .replace(/[^a-z0-9%+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value = '') {
  return new Set(normalize(value).split(' ').filter(token => token.length >= 3 && !STOPWORDS.has(token)));
}

function publisher(source = '') {
  return String(source).split('·')[0].trim().toLowerCase() || String(source).trim().toLowerCase();
}

function articleText(article) {
  return normalize(`${article?.originalTitle || ''} ${article?.headline || ''} ${article?.excerpt || ''} ${article?.summary || ''}`);
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
      options: { temperature: 0.04 }
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

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function fieldNumber(row, aliases) {
  const containers = [row, row?.dimensions, row?.dimensoes, row?.scores, row?.notas].filter(Boolean);
  for (const container of containers) {
    for (const name of aliases) {
      if (!(name in container)) continue;
      const value = numeric(container[name]);
      if (value != null && Number.isFinite(value)) return clamp(value);
    }
  }
  return null;
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['items', 'results', 'articles', 'noticias', 'news', 'data', 'analyses', 'analises']) {
    if (Array.isArray(value[key])) return value[key];
  }
  if ('id' in value) return [value];
  return Object.values(value).filter(item => item && typeof item === 'object' && 'id' in item);
}

const AI_SIGNAL = /\b(ia|ai|inteligencia artificial|artificial intelligence|chatgpt|openai|anthropic|claude|gemini|copilot|llm|modelo de linguagem|machine learning|aprendizado de maquina|rede neural|deep learning|agente de ia|agentes de ia)\b/;
const FILM_SIGNAL = /\b(filme|filmes|cinema|serie|series|temporada|episodio|ator|atriz|diretor|disney\+|netflix|hbo|max|prime video|globoplay|paramount\+|streaming)\b/;
const GAME_SIGNAL = /\b(game|games|gaming|videogame|xbox|playstation|nintendo|steam|gameplay|dlc|gta|fortnite|rpg|fps)\b/;
const SOCCER_SIGNAL = /\b(futebol|brasileirao|libertadores|copa do brasil|champions league|goleiro|zagueiro|atacante|selecao argentina|selecao brasileira|mercado da bola|soccer)\b/;
const SPORT_SIGNAL = /\b(ufc|mma|boxe|nba|wnba|basquete|nfl|super bowl|formula 1|f1|motogp|tenis|wta|atp|volei|atletismo|badminton|natacao|ciclismo|rugby|beisebol|hockey|surf|skate)\b/;
const DEV_SIGNAL = /\b(programacao|programador|desenvolvedor|developer|framework|api|github|git|devops|kubernetes|docker|banco de dados|database|javascript|typescript|python|java|qa|testes automatizados)\b/;
const MOBILE_SIGNAL = /\b(smartphone|celular|iphone|android|tablet|smartwatch|wearable|fone|earbuds|galaxy|xiaomi|motorola|pixel)\b/;
const HARDWARE_SIGNAL = /\b(cpu|gpu|placa de video|processador|chip|chips|semicondutor|memoria ram|ssd|notebook|pc gamer|monitor|ryzen|geforce|radeon)\b/;
const ECONOMY_SIGNAL = /\b(ibovespa|selic|inflacao|pib|juros|banco central|balanca comercial|superavit|deficit|pre sal|petrobras|anp|leilao|investimento|fundo multimercado|bolsa brasileira|mercado financeiro)\b/;
const SOFTWARE_SIGNAL = /\b(aplicativo|app|software|sistema operacional|windows|linux|browser|navegador|spotify|whatsapp|seguranca digital|privacidade|internet|plataforma digital)\b/;
const FUTURE_SIGNAL = /\b(robotica|robo|computacao quantica|quantum|realidade virtual|realidade aumentada|vr|ar|spatial computing|biotecnologia|fusao nuclear|energia de fusao|starship|missao espacial|telescopio|descoberta cientifica|descoberta astronomica|nobel|prototipo|tecnologia emergente)\b/;
const GENERIC_ASTRONOMY_SIGNAL = /\b(imagens astronomicas|imagem astronomica|fotos do espaco|foto do espaco|ceu da semana|astronomia da semana|saturno|lua|ceu noturno)\b/;
const PROMO_STRONG = /\b(promocao|promocoes|oferta|ofertas|desconto|cupom|% off|off|menor preco|preco baixo|liquidacao|black friday|ct ofertas|achados)\b/;
const COMMERCE_SIGNAL = /\b(amazon|mercado livre|magalu|kabum|shopee|aliexpress)\b/;
const PRICE_SIGNAL = /\b(r\$|us\$|preco|por apenas|a partir de|parcelado|parcelamento)\b/;
const LOW_NEWS_SIGNAL = /\b(agenda|jogos de hoje|onde assistir|imagens da semana|fotos da semana|rumor|rumores|pode ser cancelado|detona|reage|explica por que nao|curiosidade|lista de|melhores ofertas)\b/;

function canReassign(article, slug) {
  if (!article?.strictFocus || !Array.isArray(article.focus) || !article.focus.length) return true;
  return article.focus.includes(slug);
}

function inferStrongCategory(text) {
  if (FILM_SIGNAL.test(text) && !GAME_SIGNAL.test(text)) return 'filmes-series';
  if (GAME_SIGNAL.test(text)) return 'games';
  if (SPORT_SIGNAL.test(text) && !SOCCER_SIGNAL.test(text)) return 'esportes';
  if (SOCCER_SIGNAL.test(text)) return 'futebol';
  if (DEV_SIGNAL.test(text)) return 'desenvolvimento';
  if (MOBILE_SIGNAL.test(text)) return 'mobile-gadgets';
  if (HARDWARE_SIGNAL.test(text)) return 'hardware';
  if (ECONOMY_SIGNAL.test(text)) return 'economia';
  if (FUTURE_SIGNAL.test(text)) return 'futuro';
  if (SOFTWARE_SIGNAL.test(text)) return 'software-internet';
  if (AI_SIGNAL.test(text)) return 'ia';
  return null;
}

function sanitizeCategories(input = []) {
  let rejected = 0;
  let corrected = 0;
  const articles = [];

  for (const article of input) {
    const text = articleText(article);
    let next = { ...article };

    if (article.category === 'ia' && !AI_SIGNAL.test(text)) {
      const inferred = inferStrongCategory(text);
      if (inferred && inferred !== 'ia' && canReassign(article, inferred)) {
        next.category = inferred;
        next.editorialCategoryCorrection = `ia->${inferred}`;
        corrected += 1;
      } else {
        rejected += 1;
        continue;
      }
    }

    if (next.category === 'futuro' && GENERIC_ASTRONOMY_SIGNAL.test(text) && !FUTURE_SIGNAL.test(text)) {
      next.editorialQualityPenalty = Number((Number(next.editorialQualityPenalty || 0) + 1.5).toFixed(2));
      next.editorialContentFlags = [...new Set([...(next.editorialContentFlags || []), 'generic-astronomy-roundup'])];
    }

    articles.push(next);
  }

  return { articles, rejected, corrected };
}

function heuristicPromoLevel(article) {
  const text = articleText(article);
  if (PROMO_STRONG.test(text)) return COMMERCE_SIGNAL.test(text) ? 9 : 8;
  if (COMMERCE_SIGNAL.test(text) && PRICE_SIGNAL.test(text)) return 6;
  if (COMMERCE_SIGNAL.test(text)) return 3;
  return 0;
}

function heuristicSoftPenalty(article) {
  const text = articleText(article);
  let penalty = Number(article.editorialQualityPenalty || 0);
  if (LOW_NEWS_SIGNAL.test(text)) penalty += 0.8;
  return Math.min(2.5, penalty);
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

const DIMENSION_ALIASES = {
  impact: ['impact', 'impacto'],
  significance: ['significance', 'significancia', 'significância', 'historicalSignificance', 'historical_significance', 'pesoHistorico', 'peso_historico', 'importanciaHistorica', 'importancia_historica'],
  publicInterest: ['publicInterest', 'public_interest', 'interessePublico', 'interesse_publico', 'interesse'],
  novelty: ['novelty', 'novidade'],
  utility: ['utility', 'utilidade'],
  editorialValue: ['editorialValue', 'editorial_value', 'valorEditorial', 'valor_editorial', 'newsworthiness', 'relevanciaEditorial', 'relevancia_editorial'],
  promotionalLevel: ['promotionalLevel', 'promotional_level', 'nivelPromocional', 'nivel_promocional', 'promocional', 'promotionLevel']
};

function dimensionsFromRow(row, article) {
  const fallback = clamp(article.score);
  const raw = {};
  let present = 0;
  for (const key of ['impact', 'significance', 'publicInterest', 'novelty', 'utility', 'editorialValue']) {
    raw[key] = fieldNumber(row, DIMENSION_ALIASES[key]);
    if (raw[key] != null) present += 1;
  }

  const valid = present >= 4;
  const dimensions = {};
  for (const key of ['impact', 'significance', 'publicInterest', 'novelty', 'utility', 'editorialValue']) {
    dimensions[key] = valid ? clamp(raw[key] ?? fallback) : fallback;
  }

  const modelPromo = fieldNumber(row, DIMENSION_ALIASES.promotionalLevel);
  dimensions.promotionalLevel = Math.max(modelPromo ?? 0, heuristicPromoLevel(article));
  return { dimensions, valid, fieldsPresent: present };
}

function sectionBase(dimensions) {
  return (
    dimensions.impact * 0.15
    + dimensions.significance * 0.12
    + dimensions.publicInterest * 0.18
    + dimensions.novelty * 0.16
    + dimensions.utility * 0.17
    + dimensions.editorialValue * 0.22
  );
}

function frontPageBase(dimensions) {
  return (
    dimensions.impact * 0.28
    + dimensions.significance * 0.28
    + dimensions.publicInterest * 0.19
    + dimensions.novelty * 0.08
    + dimensions.utility * 0.05
    + dimensions.editorialValue * 0.12
  );
}

function calculateScores(article, dimensions) {
  const recency = recencyScore(article.publishedAt);
  const consensus = consensusScore(article.coverageCount);
  const cycle = article.newSinceLastEdition === false ? 5 : 10;
  const previous = clamp(article.score);
  const promo = clamp(dimensions.promotionalLevel);
  const softPenalty = heuristicSoftPenalty(article);

  const section = clamp(
    sectionBase(dimensions) * 0.82
    + recency * 0.08
    + consensus * 0.04
    + cycle * 0.03
    + previous * 0.03
    - promo * 0.20
    - softPenalty
  );

  const frontPage = clamp(
    frontPageBase(dimensions) * 0.82
    + recency * 0.05
    + consensus * 0.06
    + cycle * 0.03
    + previous * 0.04
    - promo * 0.30
    - softPenalty * 1.2
  );

  return { section, frontPage, recency, consensus, cycle, promo, softPenalty };
}

const rankingSystem = `Você é um editor experiente avaliando o valor jornalístico humano de cada matéria. NÃO escolha categoria e NÃO reescreva a notícia. Avalie cada item em escala absoluta de 0 a 10.

Contexto do leitor: ${config.editorialContext}. Locale: ${config.language}. Perfil editorial: ${profile.name}.

Para CADA id devolva EXATAMENTE estas chaves em inglês:
- impact: consequência real e alcance do acontecimento;
- significance: raridade, peso histórico ou importância duradoura;
- publicInterest: quanto um leitor bem informado deveria saber disso hoje;
- novelty: quão novo e materialmente diferente é o acontecimento;
- utility: utilidade prática ou capacidade de mudar uma decisão;
- editorialValue: valor como notícia, distinguindo jornalismo relevante de curiosidade/clickbait;
- promotionalLevel: 0 para notícia editorial sem venda; 10 para oferta, cupom, afiliado ou conteúdo essencialmente promocional.

ÂNCORAS:
- 9–10 em significance é raro: despedida/aposentadoria de figura histórica, título ou recorde extraordinário, morte de figura central, grande decisão regulatória/judicial, aquisição enorme, ruptura tecnológica, crise, desastre ou descoberta científica de grande peso;
- 7–8 representa um grande desenvolvimento do dia;
- 4–6 é notícia válida porém rotineira;
- 0–3 é detalhe menor, curiosidade, rumor fraco, agenda ou conteúdo promocional;
- resultado rotineiro de jogo não vira 8 por envolver time/seleção famosa; despedida, aposentadoria, título, recorde ou eliminação histórica podem virar 8–10;
- ofertas, descontos, cupons e listas de compra devem ter promotionalLevel alto e editorialValue baixo, salvo quando o fato econômico/tecnológico central for realmente relevante;
- fama de pessoa, empresa, clube ou marca não substitui importância do acontecimento;
- não invente contexto além do headline/summary fornecidos.

Retorne SOMENTE JSON neste formato e repita todos os ids:
{"items":[{"id":1,"impact":5,"significance":4,"publicInterest":6,"novelty":5,"utility":5,"editorialValue":6,"promotionalLevel":0}]}`;

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

const globalCalibrationSystem = `Você é o editor-chefe fechando um jornal diário. Compare as candidatas ENTRE SI.

Contexto do leitor: ${config.editorialContext}. Locale: ${config.language}. Perfil: ${profile.name}.

Para cada id atribua:
- frontPagePriority: importância relativa para disputar a MANCHETE do dia;
- sectionPriority: qualidade/relevância da matéria DENTRO da própria categoria.

REGRAS:
- frontPagePriority 9–10 é excepcional: acontecimentos históricos, transformadores ou de enorme impacto;
- 7–8 é grande destaque do dia; 4–6 é relevante mas rotineiro; 0–3 é pequeno/promocional;
- sectionPriority pode ser alto mesmo quando frontPagePriority é moderado: uma boa matéria de Games pode ser ótima para Games sem merecer a manchete geral;
- ofertas, cupons, listas de compra, rumores, agendas e roundups devem perder frontPagePriority e normalmente também sectionPriority;
- resultado rotineiro não deve liderar o jornal se houver aposentadoria, despedida histórica, título, recorde, crise, grande decisão ou descoberta claramente maior;
- compare categorias diferentes sem favorecer esporte, tecnologia ou economia por padrão;
- não invente fatos.

Retorne SOMENTE JSON: {"items":[{"id":1,"frontPagePriority":0,"sectionPriority":0}]}`;

function calibrationValue(row, type) {
  if (type === 'front') {
    return fieldNumber(row, ['frontPagePriority', 'front_page_priority', 'prioridadeManchete', 'prioridade_manchete', 'priority', 'prioridade']);
  }
  return fieldNumber(row, ['sectionPriority', 'section_priority', 'prioridadeSecao', 'prioridade_secao', 'categoryPriority', 'category_priority']);
}

async function globalCalibrate(articles) {
  const limit = Math.max(12, Math.min(40, envNumber('EDITORIAL_GLOBAL_CALIBRATION_SIZE', 30)));
  const shortlist = articles
    .slice()
    .sort((a, b) => Math.max(b.frontPageScore, b.sectionScore) - Math.max(a.frontPageScore, a.sectionScore))
    .slice(0, limit);
  if (!shortlist.length) return articles;

  const payload = shortlist.map(article => ({
    id: article.id,
    category: article.category,
    headline: article.headline || article.originalTitle,
    summary: String(article.summary || article.excerpt || '').slice(0, 340),
    publishedAt: article.publishedAt,
    coverageCount: article.coverageCount || 1,
    sectionScore: article.sectionScore,
    frontPageScore: article.frontPageScore,
    dimensions: article.importance,
    contentFlags: article.editorialContentFlags || []
  }));

  let rows;
  try {
    rows = rowsFrom(await chatJson(globalCalibrationSystem, JSON.stringify(payload)));
  } catch (error) {
    console.warn(`  Calibração global caiu para o ranking dimensional (${error.message || error}).`);
    return articles;
  }

  const byId = new Map(rows.map(row => [Number(row.id), row]));
  let validFront = 0;
  for (const row of rows) if (calibrationValue(row, 'front') != null) validFront += 1;
  if (validFront < Math.max(1, Math.ceil(shortlist.length * 0.5))) {
    console.warn('  Calibração global retornou poucas prioridades válidas; mantendo ranking dimensional.');
    return articles;
  }

  return articles.map(article => {
    const row = byId.get(Number(article.id));
    if (!row) return article;
    const frontPriority = calibrationValue(row, 'front');
    const sectionPriority = calibrationValue(row, 'section');
    const frontPageScore = frontPriority == null
      ? article.frontPageScore
      : clamp(article.frontPageScore * 0.65 + frontPriority * 0.35);
    const sectionScore = sectionPriority == null
      ? article.sectionScore
      : clamp(article.sectionScore * 0.80 + sectionPriority * 0.20);

    return {
      ...article,
      score: Number(sectionScore.toFixed(2)),
      sectionScore: Number(sectionScore.toFixed(2)),
      frontPageScore: Number(frontPageScore.toFixed(2)),
      globalPriority: frontPriority,
      sectionPriority,
      rankingSignals: {
        ...(article.rankingSignals || {}),
        globalFrontPageCalibration: frontPriority,
        globalSectionCalibration: sectionPriority
      }
    };
  });
}

async function applyHumanRanking(input) {
  const sanitized = sanitizeCategories(input);
  if (sanitized.corrected) console.log(`  Sanidade editorial: ${sanitized.corrected} categoria(s) corrigida(s) por sinal inequívoco.`);
  if (sanitized.rejected) console.log(`  Sanidade editorial: ${sanitized.rejected} matéria(s) descartada(s) por categoria sem evidência textual.`);

  const articles = sanitized.articles;
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
      const parsed = dimensionsFromRow(row || {}, article);
      const scores = calculateScores(article, parsed.dimensions);
      result.push({
        ...article,
        modelScore: article.score,
        score: Number(scores.section.toFixed(2)),
        sectionScore: Number(scores.section.toFixed(2)),
        frontPageScore: Number(scores.frontPage.toFixed(2)),
        importance: parsed.dimensions,
        rankingSignals: {
          recency: scores.recency,
          consensus: scores.consensus,
          coverageCount: article.coverageCount || 1,
          newSinceLastEdition: article.newSinceLastEdition !== false,
          promotionalLevel: scores.promo,
          softContentPenalty: scores.softPenalty,
          dimensionFieldsPresent: parsed.fieldsPresent,
          dimensionFallback: !parsed.valid
        }
      });
    }
  }

  const calibrated = await globalCalibrate(result);
  return calibrated.sort((a, b) => {
    const editorialA = Math.max(Number(a.frontPageScore || 0), Number(a.sectionScore || a.score || 0));
    const editorialB = Math.max(Number(b.frontPageScore || 0), Number(b.sectionScore || b.score || 0));
    return editorialB - editorialA || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });
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
    console.log(`  Ranking editorial humano: calibrando ${articles.length} matéria(s) por importância humana e valor dentro da seção...`);
    const ranked = await applyHumanRanking(articles);
    const top = ranked
      .slice()
      .sort((a, b) => Number(b.frontPageScore || 0) - Number(a.frontPageScore || 0))
      .slice(0, 5)
      .map(article => `${Number(article.frontPageScore || 0).toFixed(2)} ${article.headline || article.originalTitle}`)
      .join(' | ');
    if (top) console.log(`  Top primeira página: ${top}`);
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
