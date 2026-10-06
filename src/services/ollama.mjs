import { categories, config } from '../config.mjs';

function safeJson(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Resposta vazia do Ollama.');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    } catch {}
  }

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    } catch {}
  }

  throw new Error(`JSON inválido do Ollama: ${cleaned.slice(0, 180)}`);
}

async function chatJson(system, user, timeout = 120000) {
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
      options: { temperature: 0.08 }
    }),
    signal: AbortSignal.timeout(timeout)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama HTTP ${response.status}: ${body.slice(0, 180)}`);
  }

  const payload = await response.json();
  return safeJson(payload?.message?.content);
}

export async function ensureOllama() {
  let response;
  try {
    response = await fetch(`${config.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
  } catch {
    throw new Error(`Ollama não está respondendo em ${config.ollamaHost}. Execute: ollama serve`);
  }

  if (!response.ok) throw new Error(`Ollama respondeu HTTP ${response.status}.`);
  const data = await response.json();
  const models = Array.isArray(data.models) ? data.models.map(model => model.name) : [];
  const available = models.some(name => name === config.ollamaModel || name.startsWith(`${config.ollamaModel}:`) || name.startsWith(config.ollamaModel));
  if (!available) {
    throw new Error(`Modelo ${config.ollamaModel} não encontrado. Execute: ollama pull ${config.ollamaModel}`);
  }
}

const taxonomy = categories.map(category => `- ${category.slug}: ${category.name} — ${category.description}`).join('\n');
const validSlugs = new Set(categories.map(category => category.slug));

function key(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const categoryAliases = new Map();
for (const category of categories) {
  categoryAliases.set(key(category.slug), category.slug);
  categoryAliases.set(key(category.name), category.slug);
}
[
  ['ai', 'ia'], ['inteligencia artificial', 'ia'], ['artificial intelligence', 'ia'],
  ['development', 'desenvolvimento'], ['dev', 'desenvolvimento'], ['programacao', 'desenvolvimento'], ['software development', 'desenvolvimento'],
  ['mobile', 'mobile-gadgets'], ['gadgets', 'mobile-gadgets'], ['mobile gadgets', 'mobile-gadgets'], ['celulares', 'mobile-gadgets'], ['smartphones', 'mobile-gadgets'],
  ['hardware', 'hardware'], ['pc hardware', 'hardware'], ['componentes', 'hardware'],
  ['software', 'software-internet'], ['internet', 'software-internet'], ['software internet', 'software-internet'], ['software e internet', 'software-internet'], ['security', 'software-internet'], ['seguranca', 'software-internet'],
  ['game', 'games'], ['gaming', 'games'], ['jogos', 'games'],
  ['future', 'futuro'], ['emerging tech', 'futuro'], ['tecnologias emergentes', 'futuro'], ['tecnologia emergente', 'futuro']
].forEach(([alias, slug]) => categoryAliases.set(key(alias), slug));

function normalizeCategory(value) {
  const raw = value && typeof value === 'object'
    ? value.slug ?? value.category ?? value.categoria ?? value.name ?? value.nome
    : value;
  if (raw == null) return null;
  const normalized = key(raw);
  if (!normalized || ['null', 'none', 'nulo', 'off topic', 'fora do escopo', 'rejeitar', 'rejeitado'].includes(normalized)) return null;
  if (validSlugs.has(String(raw).trim())) return String(raw).trim();
  return categoryAliases.get(normalized) || null;
}

function normalizeId(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : NaN;
}

function normalizeScore(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(10, value));
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : 0;
  return Math.max(0, Math.min(10, Number.isFinite(number) ? number : 0));
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const direct = ['items', 'results', 'articles', 'noticias', 'news', 'data', 'analyses', 'analises'];
  for (const name of direct) {
    if (Array.isArray(value[name])) return value[name];
    if (value[name] && typeof value[name] === 'object') {
      const nested = Object.values(value[name]).filter(item => item && typeof item === 'object');
      if (nested.length) return nested;
    }
  }
  if ('id' in value && ('category' in value || 'categoria' in value || 'score' in value)) return [value];
  const objectRows = Object.values(value).filter(item => item && typeof item === 'object' && ('id' in item || 'category' in item || 'categoria' in item));
  return objectRows;
}

function textField(row, names, fallback = '') {
  for (const name of names) {
    if (typeof row?.[name] === 'string' && row[name].trim()) return row[name].trim();
  }
  return fallback;
}

function tagsField(row) {
  const value = row?.tags ?? row?.keywords ?? row?.palavrasChave ?? row?.palavras_chave;
  if (Array.isArray(value)) return value.map(tag => String(tag).trim()).filter(Boolean).slice(0, 6);
  if (typeof value === 'string') return value.split(/[,;|]/).map(tag => tag.trim()).filter(Boolean).slice(0, 6);
  return [];
}

const analysisSystem = `Você é o editor do Highlords Daily, uma newsletter diária brasileira de tecnologia.
Analise TODAS as matérias recebidas e devolva somente JSON válido.

IMPORTANTE:
- a lista já vem de feeds de tecnologia; na dúvida entre duas categorias, escolha a categoria mais próxima em vez de rejeitar;
- use category null SOMENTE quando a matéria estiver claramente fora do escopo;
- devolva EXATAMENTE um item para cada id recebido, inclusive os rejeitados;
- category deve ser SOMENTE um destes slugs exatos: ia, desenvolvimento, mobile-gadgets, hardware, software-internet, games, futuro; ou null;
- nunca use os nomes bonitos das categorias no campo category.

ESCOPO:
- aceite tecnologia, IA, desenvolvimento, mobile/gadgets, hardware, software/internet, games e tecnologias emergentes;
- rejeite política partidária, eleições, geopolítica, guerras, crime, tragédias, celebridades, esportes, fofoca e economia sem ligação tecnológica clara;
- regulação pode entrar quando o impacto técnico, de produto ou de plataforma for relevante;
- ciência pode entrar quando houver aplicação tecnológica clara;
- não invente fatos e use somente o material fornecido.

CATEGORIAS FIXAS:
${taxonomy}

CLASSIFICAÇÃO:
- smartphone/aparelho => mobile-gadgets;
- Android/iOS como software => software-internet;
- CPU/GPU/componente => hardware;
- SDK da OpenAI, modelo ou agente => ia;
- GitHub, linguagem, framework, QA, DevOps => desenvolvimento;
- jogo, console, Steam, engine de game => games;
- robótica experimental, quântica, protótipos e novas interfaces => futuro.

EDITORIAL:
- score de 0 a 10 mede valor para a newsletter, combinando novidade, impacto, utilidade, relevância técnica e interesse;
- uma matéria tecnológica normal e válida pode ficar entre 4 e 7; reserve 8 a 10 para grandes destaques;
- fora do escopo deve receber category null e score 0;
- headline deve ser curta, natural, informativa e SEMPRE em PT-BR;
- summary deve ter 1 ou 2 frases curtas e SEMPRE em PT-BR;
- tags: 2 a 6 termos curtos.

Retorne exatamente:
{"items":[{"id":1,"category":"ia","score":7.2,"headline":"string","summary":"string","tags":["tag"]}]}`;

function parseBatch(parsed, batch) {
  const rows = rowsFrom(parsed);
  const byId = new Map(batch.map(article => [Number(article.id), article]));
  const approved = [];
  const classified = [];
  const seen = new Set();
  let invalidId = 0;
  let invalidCategory = 0;
  let belowScore = 0;

  for (const row of rows) {
    const id = normalizeId(row?.id ?? row?.articleId ?? row?.article_id ?? row?.noticiaId ?? row?.noticia_id);
    const article = byId.get(id);
    if (!article) {
      invalidId += 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);

    const category = normalizeCategory(row?.category ?? row?.categoria ?? row?.section ?? row?.secao ?? row?.slug);
    const score = normalizeScore(row?.score ?? row?.relevance ?? row?.relevancia ?? row?.rating ?? row?.nota);
    if (!category) {
      invalidCategory += 1;
      continue;
    }

    const normalized = {
      ...article,
      category,
      score,
      headline: textField(row, ['headline', 'title', 'titulo', 'manchete'], article.originalTitle).slice(0, 220),
      summary: textField(row, ['summary', 'resumo', 'description', 'descricao'], article.excerpt || '').slice(0, 900),
      tags: tagsField(row)
    };
    classified.push(normalized);

    if (score < config.llmMinScore) {
      belowScore += 1;
      continue;
    }
    approved.push(normalized);
  }

  return {
    approved,
    classified,
    stats: {
      rows: rows.length,
      matched: seen.size,
      missing: Math.max(0, batch.length - seen.size),
      invalidId,
      invalidCategory,
      belowScore
    }
  };
}

async function analyzeBatch(batch) {
  const payload = JSON.stringify(batch.map(article => ({
    id: article.id,
    source: article.source,
    title: article.originalTitle,
    excerpt: article.excerpt,
    publishedAt: article.publishedAt
  })));

  let parsed = await chatJson(analysisSystem, payload, 150000);
  let result = parseBatch(parsed, batch);
  let retried = false;

  if (result.stats.matched < Math.max(1, Math.ceil(batch.length / 2))) {
    retried = true;
    parsed = await chatJson(
      `${analysisSystem}\n\nATENÇÃO EXTRA: sua resposta anterior não cobriu todos os IDs. Não omita nenhum item. Repita cada id exatamente uma vez.`,
      payload,
      150000
    );
    const retryResult = parseBatch(parsed, batch);
    if (retryResult.stats.matched >= result.stats.matched) result = retryResult;
  }

  return { ...result, retried };
}

export async function analyzeArticles(articles, onProgress = () => {}) {
  const selected = articles.slice(0, config.maxCandidates);
  const analyzed = [];
  const classified = [];
  const totalBatches = Math.ceil(selected.length / config.aiBatchSize);
  let failedBatches = 0;

  for (let offset = 0, batchNumber = 1; offset < selected.length; offset += config.aiBatchSize, batchNumber += 1) {
    const batch = selected.slice(offset, offset + config.aiBatchSize);
    onProgress({ status: 'start', batch: batchNumber, totalBatches, total: selected.length });
    try {
      const result = await analyzeBatch(batch);
      analyzed.push(...result.approved);
      classified.push(...result.classified);
      onProgress({
        status: 'done',
        batch: batchNumber,
        totalBatches,
        approved: result.approved.length,
        classified: result.classified.length,
        ...result.stats,
        retried: result.retried
      });
    } catch (error) {
      failedBatches += 1;
      onProgress({ status: 'error', batch: batchNumber, totalBatches, error: error.message || String(error) });
    }
  }

  if (!analyzed.length && classified.length) {
    const rescue = classified
      .filter(article => article.score > 0)
      .sort((a, b) => Number(b.score) - Number(a.score) || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, Math.min(30, classified.length));
    if (rescue.length) {
      onProgress({ status: 'rescue', count: rescue.length, threshold: config.llmMinScore });
      analyzed.push(...rescue);
    }
  }

  if (!analyzed.length && failedBatches === totalBatches) {
    throw new Error('Todos os lotes falharam ao conversar com o Ollama. Veja as mensagens de erro acima.');
  }

  return analyzed.sort((a, b) => {
    const score = Number(b.score) - Number(a.score);
    return score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });
}

export async function curateNewsletter(articles, editionDate) {
  const compact = articles.slice(0, 60).map(article => ({
    id: article.id,
    category: article.category,
    score: article.score,
    source: article.source,
    publishedAt: article.publishedAt,
    headline: article.headline,
    summary: article.summary,
    tags: article.tags
  }));

  const system = `Você é o editor-chefe do Highlords Daily.
Monte uma newsletter curta, calma e realmente útil usando SOMENTE os IDs fornecidos.

REGRAS:
- escolha 1 manchete principal entre as matérias mais importantes;
- escolha no máximo ${config.itemsPerCategory} matérias por categoria;
- as sete seções são fixas, mas podem ficar vazias se não houver notícia boa;
- não use a manchete novamente nas seções;
- não repita a mesma história ou assunto;
- prefira impacto, utilidade, novidade e relevância técnica a clickbait;
- equilibre fontes quando houver alternativas equivalentes;
- escreva título e introdução SEMPRE em português brasileiro;
- título editorial curto; introdução de no máximo 2 frases;
- não invente informações.

Categorias: ${categories.map(category => `${category.slug} (${category.name})`).join(', ')}.

Retorne SOMENTE JSON válido:
{"title":"string","intro":"string","leadId":123,"sections":{"ia":[],"desenvolvimento":[],"mobile-gadgets":[],"hardware":[],"software-internet":[],"games":[],"futuro":[]}}`;

  return chatJson(
    system,
    `Data da edição: ${editionDate}\n\nCandidatas:\n${JSON.stringify(compact)}`,
    150000
  );
}
