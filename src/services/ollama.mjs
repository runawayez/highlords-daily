import { requestChat, itemsSchema } from "./ollama-client.mjs";
import { DiskCache, digest } from "../utils/storage.mjs";
import { count } from "../engine/metrics.mjs";
import { hasOllamaModel } from "../utils/ollama-model.mjs";
import { categories, config, profile, publication } from "../config.mjs";

async function chatJson(system, user, timeout = 120000, schema = "json") {
  return requestChat(system, user, { timeoutMs: timeout, schema });
}

export async function ensureOllama() {
  let response;
  try {
    response = await fetch(`${config.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    throw new Error(
      `Ollama não está respondendo em ${config.ollamaHost}. Execute: ollama serve`,
    );
  }

  if (!response.ok)
    throw new Error(`Ollama respondeu HTTP ${response.status}.`);
  const data = await response.json();
  const models = Array.isArray(data.models)
    ? data.models.map((model) => model.name)
    : [];
  const available = hasOllamaModel(models, config.ollamaModel);
  if (!available)
    throw new Error(
      `Modelo ${config.ollamaModel} não encontrado. Execute: ollama pull ${config.ollamaModel}`,
    );
}

const taxonomy = categories
  .map(
    (category) =>
      `- ${category.slug}: ${category.name} — ${category.description}`,
  )
  .join("\n");
const validSlugs = new Set(categories.map((category) => category.slug));
const validSlugList = categories.map((category) => category.slug).join(", ");

const localeBrief = `
LOCALIZAÇÃO DA EDIÇÃO:
- idioma/locale de saída: ${config.language};
- contexto editorial do leitor: ${config.editorialContext};
- região editorial: ${config.region}; cobertura: ${config.coverage.join(", ")};
- publicação: ${publication.name};
- todo texto editorial visível ao leitor deve soar natural para esse locale, incluindo ortografia, vocabulário, terminologia e tom regional;
- traduza headline, summary, tags, título da edição, introdução, nomes de seções e rótulos de interface quando solicitado;
- preserve fatos, marcas, nomes próprios e valores originais;
- NÃO converta moedas, preços ou unidades inventando uma cotação. Se um preço estiver em moeda estrangeira, mantenha a moeda correta e deixe claro o mercado/contexto quando isso evitar uma interpretação errada;
- não sugira que preço, disponibilidade, legislação ou serviço valem para ${config.editorialContext} se a matéria não disser isso;
- adapte o enquadramento ao leitor de ${config.editorialContext} sem adicionar fatos que não estejam no material fornecido.

PERFIL EDITORIAL:
- perfil: ${profile.name} (${profile.key});
- objetivo: ${profile.description};
- tom: ${profile.tone};
- categorias prioritárias: ${profile.priorityCategories.length ? profile.priorityCategories.join(", ") : "nenhuma; equilíbrio geral"}.
`;

function key(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function topicKey(value = "") {
  return key(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 12)
    .join("-")
    .slice(0, 160);
}

const categoryAliases = new Map();
for (const category of categories) {
  for (const alias of [
    category.slug,
    category.name,
    ...(category.aliases || []),
  ]) {
    const normalized = key(alias);
    if (normalized) categoryAliases.set(normalized, category.slug);
  }
}

function normalizeCategory(value) {
  const raw =
    value && typeof value === "object"
      ? (value.slug ??
        value.category ??
        value.categoria ??
        value.name ??
        value.nome)
      : value;
  if (raw == null) return null;
  const normalized = key(raw);
  if (
    !normalized ||
    [
      "null",
      "none",
      "nulo",
      "off topic",
      "fora do escopo",
      "rejeitar",
      "rejeitado",
    ].includes(normalized)
  )
    return null;
  if (validSlugs.has(String(raw).trim())) return String(raw).trim();
  return categoryAliases.get(normalized) || null;
}

function normalizeId(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : NaN;
}

function normalizeScore(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, Math.min(10, value));
  const match = String(value ?? "")
    .replace(",", ".")
    .match(/-?\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : 0;
  return Math.max(0, Math.min(10, Number.isFinite(number) ? number : 0));
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const name of [
    "items",
    "results",
    "articles",
    "noticias",
    "news",
    "data",
    "analyses",
    "analises",
  ]) {
    if (Array.isArray(value[name])) return value[name];
    if (value[name] && typeof value[name] === "object") {
      const nested = Object.values(value[name]).filter(
        (item) => item && typeof item === "object",
      );
      if (nested.length) return nested;
    }
  }
  if (
    "id" in value &&
    ("category" in value || "categoria" in value || "score" in value)
  )
    return [value];
  return Object.values(value).filter(
    (item) =>
      item &&
      typeof item === "object" &&
      ("id" in item || "category" in item || "categoria" in item),
  );
}

function textField(row, names, fallback = "") {
  for (const name of names) {
    if (typeof row?.[name] === "string" && row[name].trim())
      return row[name].trim();
  }
  return fallback;
}

function tagsField(row) {
  const value =
    row?.tags ?? row?.keywords ?? row?.palavrasChave ?? row?.palavras_chave;
  if (Array.isArray(value))
    return value
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .slice(0, 6);
  if (typeof value === "string")
    return value
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 6);
  return [];
}

function forcedCategory(article) {
  if (
    !article?.editorialGuardrail ||
    !article?.strictFocus ||
    !Array.isArray(article.focus) ||
    article.focus.length !== 1
  )
    return null;
  return validSlugs.has(article.focus[0]) ? article.focus[0] : null;
}

const exampleSlug = categories[0]?.slug || "geral";
const analysisSystem = `Você é o editor do ${publication.name}, uma newsletter diária local e configurável.
Analise TODAS as matérias recebidas e devolva somente JSON válido.
${localeBrief}
IMPORTANTE:
- os ids recebidos são LOCAIS deste lote e sempre formam uma sequência curta começando em 1; copie cada id exatamente como foi recebido;
- devolva EXATAMENTE um item para cada id recebido, inclusive rejeitados;
- as categorias abaixo são a fonte de verdade;
- focus é uma pista editorial sobre a fonte;
- quando strictFocus for true, category deve estar dentro de focus; se nenhuma servir, use null;
- category deve ser SOMENTE um destes slugs: ${validSlugList}; ou null;
- headline, summary e topicKey devem falar EXCLUSIVAMENTE da matéria daquele id;
- duas matérias sobre o mesmo acontecimento devem receber topicKey igual ou muito parecido;
- não invente fatos.

CATEGORIAS CONFIGURADAS:
${taxonomy}

EDITORIAL:
- score 0–10 combina novidade, impacto, utilidade, relevância e interesse editorial;
- notícia válida e comum pode ficar entre 4 e 7; reserve 8–10 para grandes destaques;
- fora do escopo recebe category null e score 0;
- headline curta e natural em ${config.language};
- summary com 1 ou 2 frases curtas;
- tags com 2 a 6 termos específicos.

Retorne SOMENTE:
{"items":[{"id":1,"category":"${exampleSlug}","score":7.2,"topicKey":"assunto-central","headline":"string","summary":"string","tags":["tag"]}]}`;

function payloadForBatch(batch) {
  return JSON.stringify(
    batch.map((article, index) => ({
      id: index + 1,
      source: article.source,
      language: article.language,
      coverage: article.coverage,
      country: article.country,
      focus: article.focus,
      strictFocus: Boolean(article.strictFocus),
      editorialGuardrail: article.editorialGuardrail || null,
      title: article.originalTitle,
      excerpt: article.excerpt,
      publishedAt: article.publishedAt,
    })),
  );
}

function parseBatch(parsed, batch) {
  const rows = rowsFrom(parsed);
  const byLocalId = new Map(
    batch.map((article, index) => [index + 1, article]),
  );
  const approved = [];
  const classified = [];
  const seenLocalIds = new Set();
  const matchedArticleIds = new Set();
  let invalidId = 0;
  let invalidCategory = 0;
  let strictMismatch = 0;
  let belowScore = 0;

  for (const row of rows) {
    const localId = normalizeId(
      row?.id ??
        row?.articleId ??
        row?.article_id ??
        row?.noticiaId ??
        row?.noticia_id,
    );
    const article = byLocalId.get(localId);
    if (!article) {
      invalidId += 1;
      continue;
    }
    if (seenLocalIds.has(localId)) continue;
    seenLocalIds.add(localId);
    matchedArticleIds.add(article.id);

    const lockedCategory = forcedCategory(article);
    const category =
      lockedCategory ||
      normalizeCategory(
        row?.category ??
          row?.categoria ??
          row?.section ??
          row?.secao ??
          row?.slug,
      );
    const score = normalizeScore(
      row?.score ??
        row?.relevance ??
        row?.relevancia ??
        row?.rating ??
        row?.nota,
    );
    if (!category) {
      invalidCategory += 1;
      continue;
    }

    if (
      article.strictFocus &&
      Array.isArray(article.focus) &&
      article.focus.length &&
      !article.focus.includes(category)
    ) {
      strictMismatch += 1;
      continue;
    }

    const normalized = {
      ...article,
      category,
      score,
      topicKey: topicKey(
        textField(
          row,
          ["topicKey", "topic_key", "assunto", "storyKey", "story_key"],
          article.originalTitle,
        ),
      ),
      headline: textField(
        row,
        ["headline", "title", "titulo", "manchete"],
        article.originalTitle,
      ).slice(0, 220),
      summary: textField(
        row,
        ["summary", "resumo", "description", "descricao"],
        article.excerpt || "",
      ).slice(0, 900),
      tags: tagsField(row),
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
    matchedArticleIds: [...matchedArticleIds],
    stats: {
      rows: rows.length,
      matched: matchedArticleIds.size,
      missing: Math.max(0, batch.length - matchedArticleIds.size),
      invalidId,
      invalidCategory,
      strictMismatch,
      belowScore,
      recovered: 0,
    },
  };
}

async function analyzeBatchOnce(batch, extraInstruction = "") {
  const system = extraInstruction
    ? `${analysisSystem}\n\n${extraInstruction}`
    : analysisSystem;
  const schema = itemsSchema({
    id: { type: "integer", minimum: 1, maximum: batch.length },
    category: {
      type: ["string", "null"],
      enum: [...categories.map((c) => c.slug), null],
    },
    score: { type: "number", minimum: 0, maximum: 10 },
    topicKey: { type: "string" },
    headline: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  });
  const parsed = await chatJson(system, payloadForBatch(batch), 150000, schema);
  return parseBatch(parsed, batch);
}

function betterResult(current, candidate) {
  if (candidate.stats.matched !== current.stats.matched)
    return candidate.stats.matched > current.stats.matched
      ? candidate
      : current;
  if (candidate.classified.length !== current.classified.length)
    return candidate.classified.length > current.classified.length
      ? candidate
      : current;
  return candidate.stats.invalidId < current.stats.invalidId
    ? candidate
    : current;
}

function mergeBatchResults(base, extra, batch) {
  const classified = new Map(
    base.classified.map((article) => [article.id, article]),
  );
  const approved = new Map(
    base.approved.map((article) => [article.id, article]),
  );
  for (const article of extra.classified) classified.set(article.id, article);
  for (const article of extra.approved) approved.set(article.id, article);

  const matched = new Set([
    ...base.matchedArticleIds,
    ...extra.matchedArticleIds,
  ]);
  return {
    approved: [...approved.values()],
    classified: [...classified.values()],
    matchedArticleIds: [...matched],
    stats: {
      rows: base.stats.rows + extra.stats.rows,
      matched: matched.size,
      missing: Math.max(0, batch.length - matched.size),
      invalidId: base.stats.invalidId + extra.stats.invalidId,
      invalidCategory: base.stats.invalidCategory + extra.stats.invalidCategory,
      strictMismatch: base.stats.strictMismatch + extra.stats.strictMismatch,
      belowScore: [...classified.values()].filter(
        (article) => Number(article.score) < config.llmMinScore,
      ).length,
      recovered:
        Number(base.stats.recovered || 0) + Number(extra.stats.matched || 0),
    },
  };
}

async function analyzeBatch(batch) {
  let result = await analyzeBatchOnce(batch);
  let retried = false;
  let microRetried = false;

  if (result.stats.missing > 0 || result.stats.invalidId > 0) {
    retried = true;
    const retry = await analyzeBatchOnce(
      batch,
      `ATENÇÃO AO SCHEMA: este lote possui exatamente ${batch.length} matérias e os únicos ids válidos são ${batch.map((_, index) => index + 1).join(", ")}. Devolva cada um exatamente uma vez.`,
    );
    result = betterResult(result, retry);
  }

  if (result.stats.missing > 0) {
    const matched = new Set(result.matchedArticleIds);
    const missingArticles = batch.filter((article) => !matched.has(article.id));
    for (let offset = 0; offset < missingArticles.length; offset += 3) {
      microRetried = true;
      const chunk = missingArticles.slice(offset, offset + 3);
      try {
        const recovered = await analyzeBatchOnce(
          chunk,
          `RECUPERAÇÃO: responda TODOS os ${chunk.length} itens. Os ids válidos são somente ${chunk.map((_, index) => index + 1).join(", ")}.`,
        );
        result = mergeBatchResults(result, recovered, batch);
      } catch {}
    }
  }

  return { ...result, retried, microRetried };
}

function addUnique(target, article, ids) {
  if (!article || ids.has(article.id)) return false;
  target.push(article);
  ids.add(article.id);
  return true;
}

async function analyzeArticlesUncached(articles, onProgress = () => {}) {
  const selected = articles.slice(0, config.maxCandidates);
  const analyzed = [];
  const classified = [];
  const analyzedIds = new Set();
  const classifiedIds = new Set();
  const totalBatches = Math.ceil(selected.length / config.aiBatchSize);
  let failedBatches = 0;

  for (
    let offset = 0, batchNumber = 1;
    offset < selected.length;
    offset += config.aiBatchSize, batchNumber += 1
  ) {
    const batch = selected.slice(offset, offset + config.aiBatchSize);
    onProgress({
      status: "start",
      batch: batchNumber,
      totalBatches,
      total: selected.length,
    });
    try {
      const result = await analyzeBatch(batch);
      for (const article of result.approved)
        addUnique(analyzed, article, analyzedIds);
      for (const article of result.classified)
        addUnique(classified, article, classifiedIds);
      onProgress({
        status: "done",
        batch: batchNumber,
        totalBatches,
        approved: result.approved.length,
        classified: result.classified.length,
        ...result.stats,
        retried: result.retried || result.microRetried,
      });
    } catch (error) {
      failedBatches += 1;
      onProgress({
        status: "error",
        batch: batchNumber,
        totalBatches,
        error: error.message || String(error),
      });
    }
  }

  if (!analyzed.length && classified.length) {
    const rescue = classified
      .filter((article) => article.score > 0)
      .sort(
        (a, b) =>
          Number(b.score) - Number(a.score) ||
          new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
      )
      .slice(0, Math.min(30, classified.length));
    for (const article of rescue) addUnique(analyzed, article, analyzedIds);
    if (rescue.length)
      onProgress({
        status: "rescue",
        count: rescue.length,
        threshold: config.llmMinScore,
      });
  }

  const rescueFloor = Math.max(0, config.llmMinScore - 1);
  const targetPerCategory = config.itemsPerCategory + 1;

  for (const category of categories) {
    let count = analyzed.filter(
      (article) => article.category === category.slug,
    ).length;
    if (count < targetPerCategory) {
      const extras = classified
        .filter(
          (article) =>
            article.category === category.slug &&
            !analyzedIds.has(article.id) &&
            Number(article.score) >= rescueFloor,
        )
        .sort(
          (a, b) =>
            Number(b.score) - Number(a.score) ||
            new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
        );

      let added = 0;
      for (const article of extras) {
        if (count >= targetPerCategory) break;
        if (addUnique(analyzed, article, analyzedIds)) {
          count += 1;
          added += 1;
        }
      }
      if (added)
        onProgress({
          status: "category-rescue",
          category: category.name,
          count: added,
          floor: rescueFloor,
          total: count,
        });
    }

    if (count === 0) {
      const bestCoverageCandidate = classified
        .filter(
          (article) =>
            article.category === category.slug &&
            !analyzedIds.has(article.id) &&
            Number(article.score) > 0,
        )
        .sort(
          (a, b) =>
            Number(b.score) - Number(a.score) ||
            new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
        )[0];
      if (
        bestCoverageCandidate &&
        addUnique(analyzed, bestCoverageCandidate, analyzedIds)
      ) {
        onProgress({
          status: "category-rescue",
          category: category.name,
          count: 1,
          floor: 0,
          total: 1,
        });
      }
    }
  }

  if (!analyzed.length && failedBatches === totalBatches) {
    throw new Error(
      "Todos os lotes falharam ao conversar com o Ollama. Veja as mensagens de erro acima.",
    );
  }

  return analyzed.sort((a, b) => {
    const priorityA = profile.priorityCategories.includes(a.category)
      ? 0.25
      : 0;
    const priorityB = profile.priorityCategories.includes(b.category)
      ? 0.25
      : 0;
    const score = Number(b.score) + priorityB - (Number(a.score) + priorityA);
    return score || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });
}

function editorPool(articles, limit = 96) {
  const selected = [];
  const ids = new Set();
  const perCategory = Math.max(2, config.itemsPerCategory + 1);

  for (const category of categories) {
    const candidates = articles
      .filter((article) => article.category === category.slug)
      .sort(
        (a, b) =>
          Number(b.sectionScore ?? b.score ?? 0) -
            Number(a.sectionScore ?? a.score ?? 0) ||
          Number(b.frontPageScore ?? 0) - Number(a.frontPageScore ?? 0) ||
          new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
      )
      .slice(0, perCategory);
    for (const article of candidates) addUnique(selected, article, ids);
  }

  const overall = [...articles].sort(
    (a, b) =>
      Number(b.frontPageScore ?? b.score ?? 0) -
        Number(a.frontPageScore ?? a.score ?? 0) ||
      Number(b.sectionScore ?? b.score ?? 0) -
        Number(a.sectionScore ?? a.score ?? 0) ||
      new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
  );
  for (const article of overall) {
    if (selected.length >= limit) break;
    addUnique(selected, article, ids);
  }
  return selected.slice(0, limit);
}

export async function curateNewsletter(articles, editionDate) {
  const compact = editorPool(articles).map((article) => ({
    id: article.id,
    category: article.category,
    score: article.score,
    sectionScore: article.sectionScore,
    frontPageScore: article.frontPageScore,
    source: article.source,
    publishedAt: article.publishedAt,
    topicKey: article.topicKey,
    headline: article.headline,
    summary: article.summary,
    tags: article.tags,
  }));

  const emptySections = Object.fromEntries(
    categories.map((category) => [category.slug, []]),
  );
  const sectionTitles = Object.fromEntries(
    categories.map((category) => [category.slug, category.name]),
  );
  const responseExample = {
    title: "string",
    intro: "string",
    leadId: 123,
    sectionTitles,
    sections: emptySections,
  };

  const system = `Você é o editor-chefe do ${publication.name}.
Monte uma newsletter curta, calma e realmente útil usando SOMENTE os IDs fornecidos.
${localeBrief}
REGRAS:
- escolha 1 manchete principal entre as matérias mais importantes, dando preferência ao maior frontPageScore quando disponível;
- escolha no máximo ${config.itemsPerCategory} matérias por categoria;
- sempre que existirem candidatas suficientes, preencha ${config.itemsPerCategory} matérias em cada categoria;
- existem ${categories.length} seções configuradas e TODAS devem aparecer como chaves em sections;
- uma seção só fica incompleta quando realmente não houver candidatas válidas;
- não use a manchete novamente nas seções;
- não repita a mesma história, acontecimento ou topicKey;
- prefira impacto, utilidade, novidade e relevância a clickbait;
- equilibre fontes quando houver alternativas equivalentes;
- escreva title, intro, sectionTitles em ${config.language}, naturais para ${config.editorialContext};
- não invente informações.

Categorias configuradas:
${taxonomy}

Retorne SOMENTE JSON válido no formato:
${JSON.stringify(responseExample)}`;

  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      leadId: { type: "integer", enum: compact.map((article) => article.id) },
      sectionTitles: {
        type: "object",
        properties: Object.fromEntries(
          categories.map((category) => [category.slug, { type: "string" }]),
        ),
        required: categories.map((category) => category.slug),
        additionalProperties: false,
      },
      sections: {
        type: "object",
        properties: Object.fromEntries(
          categories.map((category) => [
            category.slug,
            {
              type: "array",
              items: {
                type: "integer",
                enum: compact.map((article) => article.id),
              },
            },
          ]),
        ),
        required: categories.map((category) => category.slug),
        additionalProperties: false,
      },
    },
    required: ["title", "intro", "leadId", "sectionTitles", "sections"],
    additionalProperties: false,
  };
  return chatJson(
    system,
    `Data da edição: ${editionDate}\nIdioma: ${config.language}\nContexto editorial: ${config.editorialContext}\nPerfil editorial: ${profile.name}\n\nCandidatas:\n${JSON.stringify(compact)}`,
    150000,
    schema,
  );
}

const analysisCache = new DiskCache(config.cacheDir);
export async function analyzeArticles(articles, onProgress = () => {}) {
  if (!config.analysisCacheDays)
    return analyzeArticlesUncached(articles, onProgress);
  const keys = new Map();
  const hits = [];
  const pending = [];
  for (const article of articles) {
    const key = digest({
      version: 2,
      model: config.ollamaModel,
      prompt: analysisSystem,
      language: config.language,
      context: config.editorialContext,
      region: config.region,
      taxonomy: categories,
      stableId: article.stableId,
      content: [article.originalTitle, article.excerpt, article.publishedAt],
      focus: article.focus,
      strict: article.strictFocus,
      guardrail: article.editorialGuardrail,
      threshold: config.llmMinScore,
    });
    keys.set(article.id, key);
    const cached = await analysisCache.get("analysis", key);
    if (cached) {
      hits.push({
        ...article,
        ...cached,
        id: article.id,
        stableId: article.stableId,
      });
      count("analysisCacheHits");
    } else pending.push(article);
  }
  const analyzed = pending.length
    ? await analyzeArticlesUncached(pending, onProgress)
    : [];
  for (const article of analyzed) {
    const cached = Object.fromEntries(
      ["category", "score", "topicKey", "headline", "summary", "tags"].map(
        (key) => [key, article[key]],
      ),
    );
    await analysisCache.set(
      "analysis",
      keys.get(article.id),
      cached,
      config.analysisCacheDays * 86400000,
    );
  }
  return [...hits, ...analyzed].sort((a, b) => a.id - b.id);
}
