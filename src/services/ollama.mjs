import { config } from '../config.mjs';

export async function checkOllama() {
  try {
    const response = await fetch(`${config.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models.map(model => model.name) : [];
    return { ok: true, model: config.ollamaModel, modelAvailable: models.some(name => name.startsWith(config.ollamaModel)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function safeJson(content) {
  if (typeof content !== 'string') throw new Error('Resposta vazia do Ollama');
  const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

export async function analyzeArticle(article, categories) {
  const categoryText = categories
    .filter(category => category.enabled)
    .map(category => `- ${category.slug}: ${category.name} — ${category.description}`)
    .join('\n');

  const system = `Você é o editor do Highlords Post, um jornal pessoal em português brasileiro.
Sua função é classificar e condensar notícias com precisão.
Nunca invente fatos, números, datas, citações ou contexto ausente.
Use apenas o título, a fonte e o trecho fornecidos.
Escreva headline e summary sempre em português brasileiro.
Se a matéria não se encaixar bem em nenhuma categoria, use category como null e score baixo.
Score vai de 0 a 10 e mede o quanto a matéria combina com os interesses descritos nas categorias.
Retorne SOMENTE JSON válido com este formato:
{"headline":"string","summary":"string","category":"slug-ou-null","score":0,"tags":["tag"]}`;

  const user = `Categorias disponíveis:\n${categoryText}\n\nNotícia:\n${JSON.stringify({
    source: article.source,
    title: article.originalTitle,
    excerpt: article.excerpt
  })}`;

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
      options: { temperature: 0.15 }
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama HTTP ${response.status}: ${body.slice(0, 180)}`);
  }

  const payload = await response.json();
  const parsed = safeJson(payload?.message?.content);
  const validSlugs = new Set(categories.filter(c => c.enabled).map(c => c.slug));
  const category = typeof parsed.category === 'string' && validSlugs.has(parsed.category)
    ? parsed.category
    : null;

  return {
    headline: String(parsed.headline || article.originalTitle).trim().slice(0, 220),
    summary: String(parsed.summary || article.excerpt || '').trim().slice(0, 900),
    category,
    score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8)
      : []
  };
}
