import { categories, config } from '../config.mjs';

function safeJson(content) {
  if (typeof content !== 'string') throw new Error('Resposta vazia do Ollama.');
  const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
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
      options: { temperature: 0.1 }
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

async function analyzeBatch(batch) {
  const system = `Você é o editor do Highlords Daily, uma newsletter diária brasileira de tecnologia.
Analise cada matéria de forma independente e devolva somente JSON válido.

ESCOPO:
- aceite apenas tecnologia, IA, desenvolvimento, mobile/gadgets, hardware, software/internet, games e tecnologias emergentes;
- rejeite política partidária, eleições, governos, geopolítica, guerras, crime, tragédias, celebridades, esportes, fofoca e economia sem ligação tecnológica clara;
- regulação só entra quando o impacto técnico, de produto ou de plataforma for o assunto principal;
- ciência só entra quando houver aplicação tecnológica clara;
- não invente fatos e use somente o material fornecido.

CATEGORIAS FIXAS:
${taxonomy}

CLASSIFICAÇÃO:
- escolha uma única categoria pelo assunto principal;
- smartphone/aparelho => mobile-gadgets;
- Android/iOS como software => software-internet;
- CPU/GPU/componente => hardware;
- SDK da OpenAI, modelo ou agente => ia;
- GitHub, linguagem, framework, QA, DevOps => desenvolvimento;
- jogo, console, Steam, engine de game => games;
- robótica experimental, quântica, protótipos e novas interfaces => futuro.

EDITORIAL:
- score de 0 a 10 mede importância para a newsletter do dia, combinando novidade, impacto, utilidade, relevância técnica e interesse;
- conteúdo fraco, repetitivo, promocional ou fora do escopo deve receber score baixo ou category null;
- headline deve ser curta, natural e informativa em PT-BR;
- summary deve ter 1 ou 2 frases curtas em PT-BR;
- tags: 2 a 6 termos curtos de marcas, produtos e assuntos secundários.

Retorne exatamente:
{"items":[{"id":1,"category":"slug-ou-null","score":0,"headline":"string","summary":"string","tags":["tag"]}]}`;

  const user = JSON.stringify(batch.map(article => ({
    id: article.id,
    source: article.source,
    title: article.originalTitle,
    excerpt: article.excerpt,
    publishedAt: article.publishedAt
  })));

  const parsed = await chatJson(system, user);
  const rows = Array.isArray(parsed?.items) ? parsed.items : [];
  const byId = new Map(batch.map(article => [Number(article.id), article]));
  const result = [];

  for (const row of rows) {
    const article = byId.get(Number(row?.id));
    if (!article) continue;
    const category = typeof row.category === 'string' && validSlugs.has(row.category) ? row.category : null;
    const score = Math.max(0, Math.min(10, Number(row.score) || 0));
    if (!category || score < config.minScore) continue;

    result.push({
      ...article,
      category,
      score,
      headline: String(row.headline || article.originalTitle).trim().slice(0, 220),
      summary: String(row.summary || article.excerpt || '').trim().slice(0, 900),
      tags: Array.isArray(row.tags)
        ? row.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 6)
        : []
    });
  }

  return result;
}

export async function analyzeArticles(articles, onProgress = () => {}) {
  const selected = articles.slice(0, config.maxCandidates);
  const analyzed = [];
  const totalBatches = Math.ceil(selected.length / config.aiBatchSize);

  for (let offset = 0, batchNumber = 1; offset < selected.length; offset += config.aiBatchSize, batchNumber += 1) {
    const batch = selected.slice(offset, offset + config.aiBatchSize);
    onProgress({ batch: batchNumber, totalBatches, analyzed: analyzed.length, total: selected.length });
    const result = await analyzeBatch(batch);
    analyzed.push(...result);
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
- escreva um título editorial curto e uma introdução de no máximo 2 frases;
- não invente informações.

Categorias: ${categories.map(category => `${category.slug} (${category.name})`).join(', ')}.

Retorne SOMENTE JSON válido:
{"title":"string","intro":"string","leadId":123,"sections":{"ia":[],"desenvolvimento":[],"mobile-gadgets":[],"hardware":[],"software-internet":[],"games":[],"futuro":[]}}`;

  return chatJson(
    system,
    `Data da edição: ${editionDate}\n\nCandidatas:\n${JSON.stringify(compact)}`,
    120000
  );
}
