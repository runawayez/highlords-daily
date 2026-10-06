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

const taxonomy = categories
  .map(category => `- ${category.slug}: ${category.name} — ${category.description}`)
  .join('\n');
const validSlugs = new Set(categories.map(category => category.slug));
const validSlugList = categories.map(category => category.slug).join(', ');

const localeBrief = `
LOCALIZAÇÃO DA EDIÇÃO:
- idioma/locale de saída: ${config.language};
- contexto editorial do leitor: ${config.editorialContext};
- todo texto editorial visível ao leitor deve soar natural para esse locale, incluindo ortografia, vocabulário, terminologia e tom regional;
- traduza headline, summary, tags, título da edição, introdução, nomes de seções e rótulos de interface quando solicitado;
- preserve fatos, marcas, nomes próprios e valores originais;
- NÃO converta moedas, preços ou unidades inventando uma cotação. Se um preço estiver em moeda estrangeira, mantenha a moeda correta e deixe claro o mercado/contexto quando isso evitar uma interpretação errada;
- não sugira que preço, disponibilidade, legislação ou serviço valem para ${config.editorialContext} se a matéria não disser isso;
- adapte o enquadramento ao leitor de ${config.editorialContext} sem adicionar fatos que não estejam no material fornecido.
`;

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
  const aliases = [category.slug, category.name, ...(category.aliases || [])];
  for (const alias of aliases) {
    const normalized = key(alias);
    if (normalized) categoryAliases.set(normalized, category.slug);
  }
}

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
  return Object.values(value).filter(item => item && typeof item === 'object' && ('id' in item || 'category' in item || 'categoria' in item));
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

const exampleSlug = categories[0]?.slug || 'geral';
const analysisSystem = `Você é o editor do Highlords Daily, uma newsletter diária local e configurável.
Analise TODAS as matérias recebidas e devolva somente JSON válido.
${localeBrief}
IMPORTANTE:
- as categorias editoriais abaixo são a fonte de verdade desta newsletter;
- focus é uma pista editorial sobre a fonte;
- quando strictFocus for true, a categoria escolhida DEVE obrigatoriamente estar dentro de focus; se nenhuma categoria de focus servir, use category null;
- quando strictFocus for false, escolha livremente entre as categorias configuradas;
- FUTEBOL significa exclusivamente futebol de associação/soccer. NFL, NCAA football, American football, quarterback, Super Bowl e similares pertencem a ESPORTES, nunca a FUTEBOL;
- não classifique automaticamente a palavra inglesa "football" como futebol: determine pelo contexto se é soccer ou futebol americano;
- na dúvida entre duas categorias válidas, escolha a categoria cujo assunto central melhor representa a matéria;
- use category null SOMENTE quando a matéria claramente não pertencer a nenhuma categoria configurada;
- devolva EXATAMENTE um item para cada id recebido, inclusive os rejeitados;
- category deve ser SOMENTE um destes slugs exatos: ${validSlugList}; ou null;
- nunca use os nomes bonitos das categorias no campo category;
- headline e summary devem descrever EXCLUSIVAMENTE a matéria daquele mesmo id. Nunca misture, copie ou transfira conteúdo de um id para outro;
- não invente fatos e use somente o material fornecido.

CATEGORIAS CONFIGURADAS:
${taxonomy}

EDITORIAL:
- score de 0 a 10 mede valor para esta newsletter, combinando novidade, impacto, utilidade, relevância para o leitor e interesse editorial;
- uma matéria válida e comum pode ficar entre 4 e 7; reserve 8 a 10 para grandes destaques;
- fora do escopo deve receber category null e score 0;
- headline deve ser curta, natural e informativa no locale ${config.language};
- summary deve ter 1 ou 2 frases curtas no locale ${config.language};
- tags: 2 a 6 termos curtos e específicos no idioma da edição.

Retorne exatamente:
{"items":[{"id":1,"category":"${exampleSlug}","score":7.2,"headline":"string","summary":"string","tags":["tag"]}]}`;

function parseBatch(parsed, batch) {
  const rows = rowsFrom(parsed);
  const byId = new Map(batch.map(article => [Number(article.id), article]));
  const approved = [];
  const classified = [];
  const seen = new Set();
  let invalidId = 0;
  let invalidCategory = 0;
  let strictMismatch = 0;
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

    if (article.strictFocus && Array.isArray(article.focus) && article.focus.length && !article.focus.includes(category)) {
      strictMismatch += 1;
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
      strictMismatch,
      belowScore
    }
  };
}

async function analyzeBatch(batch) {
  const payload = JSON.stringify(batch.map(article => ({
    id: article.id,
    source: article.source,
    focus: article.focus,
    strictFocus: Boolean(article.strictFocus),
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
      `${analysisSystem}\n\nATENÇÃO EXTRA: sua resposta anterior não cobriu todos os IDs. Não omita nenhum item. Repita cada id exatamente uma vez e nunca misture o conteúdo entre IDs.`,
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

  const rescueFloor = Math.max(0, config.llmMinScore - 1);
  const targetPerCategory = config.itemsPerCategory + 1;
  const selectedIds = new Set(analyzed.map(article => article.id));

  for (const category of categories) {
    let count = analyzed.filter(article => article.category === category.slug).length;
    if (count >= targetPerCategory) continue;

    const extras = classified
      .filter(article => article.category === category.slug && !selectedIds.has(article.id) && Number(article.score) >= rescueFloor)
      .sort((a, b) => Number(b.score) - Number(a.score) || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    let added = 0;
    for (const article of extras) {
      analyzed.push(article);
      selectedIds.add(article.id);
      count += 1;
      added += 1;
      if (count >= targetPerCategory) break;
    }

    if (added) {
      onProgress({
        status: 'category-rescue',
        category: category.name,
        count: added,
        floor: rescueFloor,
        total: count
      });
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
  const compact = articles.slice(0, 80).map(article => ({
    id: article.id,
    category: article.category,
    score: article.score,
    source: article.source,
    publishedAt: article.publishedAt,
    headline: article.headline,
    summary: article.summary,
    tags: article.tags
  }));

  const emptySections = Object.fromEntries(categories.map(category => [category.slug, []]));
  const sectionTitles = Object.fromEntries(categories.map(category => [category.slug, category.name]));
  const responseExample = {
    title: 'string',
    intro: 'string',
    leadId: 123,
    sectionTitles,
    ui: {
      brandTagline: 'string',
      dailyEdition: 'string',
      leadLabel: 'string',
      readArticle: 'string',
      highlightSingular: 'string',
      highlightPlural: 'string',
      storySingular: 'string',
      storyPlural: 'string',
      sourceSingular: 'string',
      sourcePlural: 'string',
      candidateSingular: 'string',
      candidatePlural: 'string',
      localAiCuration: 'string'
    },
    sections: emptySections
  };

  const system = `Você é o editor-chefe do Highlords Daily.
Monte uma newsletter curta, calma e realmente útil usando SOMENTE os IDs fornecidos.
${localeBrief}
REGRAS:
- escolha 1 manchete principal entre as matérias mais importantes;
- escolha no máximo ${config.itemsPerCategory} matérias por categoria;
- sempre que existirem candidatas suficientes, preencha ${config.itemsPerCategory} matérias em cada categoria;
- existem ${categories.length} seções configuradas e elas devem aparecer como chaves em sections;
- uma seção só deve ficar incompleta quando realmente não houver candidatas suficientes para ela;
- não use a manchete novamente nas seções;
- não repita a mesma história ou assunto;
- Futebol significa soccer/futebol de associação; NFL e futebol americano pertencem a Esportes;
- prefira impacto, utilidade, novidade e relevância a clickbait;
- equilibre fontes quando houver alternativas equivalentes;
- escreva title e intro no locale ${config.language}, naturais para ${config.editorialContext};
- em sectionTitles, devolva um nome de seção natural no idioma da edição para CADA slug configurado, preservando o significado editorial;
- em ui, traduza/localize TODOS os rótulos para ${config.language}; mantenha brandTagline curto e em caixa adequada ao idioma;
- título editorial curto; introdução de no máximo 2 frases;
- não invente informações.

Categorias configuradas:
${taxonomy}

Retorne SOMENTE JSON válido no formato:
${JSON.stringify(responseExample)}`;

  return chatJson(
    system,
    `Data da edição: ${editionDate}\nIdioma: ${config.language}\nContexto editorial: ${config.editorialContext}\n\nCandidatas:\n${JSON.stringify(compact)}`,
    150000
  );
}
