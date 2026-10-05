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
      options: { temperature: 0.12 }
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

export async function analyzeArticle(article, categories) {
  const categoryText = categories
    .filter(category => category.enabled)
    .map(category => `- ${category.slug}: ${category.name} — ${category.description}`)
    .join('\n');

  const system = `Você é o editor do Highlords Post, um reader pessoal de tecnologia em português brasileiro.
O Highlords existe para uma leitura leve e relaxante sobre tecnologia, IA, desenvolvimento, games e inovação.

ESCOPO OBRIGATÓRIO:
- aceite somente matérias cujo assunto principal seja tecnologia, inteligência artificial, desenvolvimento de software, hardware, segurança, open source, ferramentas para desenvolvedores, games ou inovação tecnológica;
- rejeite política partidária, eleições, governos, geopolítica, guerras, crime, tragédias, celebridades, esportes, fofoca, sociedade em geral e economia sem relação direta com tecnologia;
- se política, governo, eleição ou conflito forem o assunto central, use category como null e score 0, mesmo que a matéria mencione uma empresa de tecnologia;
- regulações ou decisões públicas só podem entrar quando o núcleo da matéria for uma mudança técnica ou de produto claramente útil para quem acompanha tecnologia; evite enquadramento político;
- notícias de games devem ser sobre jogos, plataformas, hardware, engines, estúdios, lançamentos ou desenvolvimento; evite esports e celebridades;
- ciência só entra quando houver aplicação ou impacto tecnológico claro.

TOM EDITORIAL:
- priorize novidade útil, curiosidade, ferramentas, lançamentos, atualizações, engenharia, produtos e descobertas interessantes;
- evite clickbait, alarmismo e dramatização;
- escreva headline natural e informativa, sem exagero;
- escreva summary em 1 ou 2 frases curtas, agradável de ler e fiel ao material recebido.

Nunca invente fatos, números, datas, citações ou contexto ausente.
Use apenas o título, a fonte e o trecho fornecidos.
Escreva headline e summary sempre em português brasileiro.
Se a matéria não se encaixar claramente no escopo, use category como null e score 0.
Score vai de 0 a 10 e mede utilidade/interesse para um leitor de tecnologia que quer se atualizar sem ruído.
Retorne SOMENTE JSON válido com este formato:
{"headline":"string","summary":"string","category":"slug-ou-null","score":0,"tags":["tag"]}`;

  const user = `Categorias disponíveis:\n${categoryText}\n\nNotícia:\n${JSON.stringify({
    source: article.source,
    title: article.originalTitle,
    excerpt: article.excerpt
  })}`;

  const parsed = await chatJson(system, user);
  const validSlugs = new Set(categories.filter(c => c.enabled).map(c => c.slug));
  const category = typeof parsed.category === 'string' && validSlugs.has(parsed.category)
    ? parsed.category
    : null;
  const rawScore = Math.max(0, Math.min(10, Number(parsed.score) || 0));

  return {
    headline: String(parsed.headline || article.originalTitle).trim().slice(0, 220),
    summary: String(parsed.summary || article.excerpt || '').trim().slice(0, 900),
    category,
    score: category ? rawScore : 0,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8)
      : []
  };
}

export async function curateEdition(articles, categories) {
  const compactArticles = articles.slice(0, 48).map(article => ({
    id: article.id,
    category: article.category,
    score: article.score,
    source: article.source,
    publishedAt: article.publishedAt,
    headline: article.headline || article.originalTitle,
    summary: article.summary
  }));

  const categoryText = categories.map(category => ({
    slug: category.slug,
    name: category.name,
    description: category.description
  }));

  const system = `Você é o editor-chefe do Highlords Post, um reader relaxante de tecnologia.
Monte uma edição curta, variada e prazerosa usando SOMENTE os IDs fornecidos.
O foco editorial é tecnologia, IA, desenvolvimento, games e inovação.
Priorize lançamentos, ferramentas, atualizações, engenharia, produtos, descobertas e histórias interessantes.
Evite sensação de feed ansioso: não concentre a edição em polêmica, demissões, conflito ou drama corporativo quando houver alternativas úteis.
Escolha uma manchete principal importante, recente e interessante — não apenas a de maior score.
Equilibre fontes e assuntos quando houver boas alternativas.
Não invente nem reescreva fatos nesta etapa: você só organiza matérias já processadas.
Retorne SOMENTE JSON válido no formato:
{"leadId":123,"sectionOrder":["slug"],"sections":{"slug":[123,456]}}
Use no máximo 6 matérias por seção. Cada ID deve aparecer no máximo uma vez. A leadId não deve reaparecer nas seções.`;

  return chatJson(
    system,
    `Categorias selecionadas:\n${JSON.stringify(categoryText)}\n\nMatérias candidatas:\n${JSON.stringify(compactArticles)}`,
    90000
  );
}
