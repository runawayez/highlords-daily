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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasAny(text, terms) {
  return terms.some(term => text.includes(term));
}

// Tecnologia é a categoria guarda-chuva. Quando o modelo cai nela, usamos
// sinais fortes do próprio texto para promover a matéria a uma seção mais
// específica. Isso evita uma home inteira classificada simplesmente como Tech.
function preferSpecificCategory(article, category, validSlugs) {
  if (category !== 'tecnologia') return category;

  const text = normalizeText(`${article.originalTitle || ''} ${article.excerpt || ''}`);
  const candidates = [
    ['games', [
      ' videogame', ' video game', ' game ', ' games ', ' gaming', 'steam',
      'playstation', 'xbox', 'nintendo', 'switch 2', 'epic games', 'gog',
      'unreal engine', 'unity ', 'rpg', 'indie game', 'game pass'
    ]],
    ['ia', [
      'inteligencia artificial', 'artificial intelligence', 'generative ai',
      'machine learning', 'openai', 'chatgpt', 'anthropic', 'claude', 'gemini',
      'llm', 'large language model', 'modelo de linguagem', 'ai model',
      'ai agent', 'agente de ia', 'inference', 'inferencia', 'deep learning'
    ]],
    ['qa-dev', [
      'github', 'gitlab', 'developer', 'desenvolvedor', 'programacao', 'programming',
      'javascript', 'typescript', 'python', 'rust ', 'golang', 'java ', '.net',
      'framework', 'api ', 'database', 'banco de dados', 'kubernetes', 'docker',
      'devops', 'ci/cd', 'playwright', 'selenium', 'testing', 'teste automatizado',
      'vscode', 'visual studio code', 'ide ', 'sdk ', 'npm ', 'open source project'
    ]],
    ['inovacao', [
      'robotica', 'robotics', 'humanoid', 'robo humanoide', 'quantum computing',
      'computacao quantica', 'virtual reality', 'realidade virtual',
      'augmented reality', 'realidade aumentada', 'mixed reality', 'spatial computing',
      'brain-computer', 'neural interface', 'prototype', 'prototipo', 'wearable'
    ]]
  ];

  for (const [slug, terms] of candidates) {
    if (validSlugs.has(slug) && hasAny(text, terms)) return slug;
  }
  return category;
}

export async function analyzeArticle(article, categories) {
  const enabledCategories = categories.filter(category => category.enabled);
  const categoryText = enabledCategories
    .map(category => `- ${category.slug}: ${category.name} — ${category.description}`)
    .join('\n');

  const system = `Você é o editor do Highlords Post, um reader pessoal de tecnologia em português brasileiro.
O Highlords existe para uma leitura leve e relaxante sobre tecnologia, IA, desenvolvimento, games e inovação.

ESCOPO OBRIGATÓRIO:
- aceite somente matérias cujo assunto principal seja tecnologia, inteligência artificial, desenvolvimento de software, hardware, segurança, open source, ferramentas para desenvolvedores, games ou inovação tecnológica;
- rejeite política partidária, eleições, governos, geopolítica, guerras, crime, tragédias, celebridades, esportes, fofoca, sociedade em geral e economia sem relação direta com tecnologia;
- se política, governo, eleição ou conflito forem o assunto central, use category como null e score 0, mesmo que a matéria mencione uma empresa de tecnologia;
- regulações ou decisões públicas só podem entrar quando o núcleo da matéria for uma mudança técnica ou de produto claramente útil para quem acompanha tecnologia; evite enquadramento político;
- ciência só entra quando houver aplicação ou impacto tecnológico claro.

REGRA DE CATEGORIZAÇÃO — MUITO IMPORTANTE:
Escolha SEMPRE a categoria mais específica. "tecnologia" é apenas a categoria guarda-chuva e deve ser usada somente quando nenhuma das categorias especializadas abaixo representar melhor o assunto principal.
- ia: IA generativa, LLMs, modelos, agentes, machine learning, OpenAI, Anthropic, Gemini, pesquisa e produtos cujo núcleo seja IA;
- qa-dev: programação, engenharia de software, QA, testes, linguagens, frameworks, APIs, bancos de dados, GitHub, DevOps, cloud, CI/CD e ferramentas de desenvolvimento;
- games: jogos, consoles, Steam, estúdios, engines, lançamentos, indies, RPGs, hardware especificamente gamer e desenvolvimento de jogos;
- inovacao: robótica, computação quântica, VR/AR, interfaces emergentes, protótipos, wearables e tecnologias experimentais;
- tecnologia: hardware e software de uso geral, smartphones, PCs, chips, sistemas operacionais, browsers, segurança, internet e produtos tech que não pertençam claramente às quatro categorias acima.

Exemplos obrigatórios:
- "OpenAI lança novo modelo" => ia, nunca tecnologia.
- "GitHub adiciona recurso ao Actions" => qa-dev, nunca tecnologia.
- "Novo RPG chega ao Steam" => games, nunca tecnologia.
- "Robô humanoide ganha nova mão" => inovacao, nunca tecnologia.
- "AMD lança nova GPU de uso geral" => tecnologia, salvo se o foco explícito for gaming.

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
  const validSlugs = new Set(enabledCategories.map(category => category.slug));
  let category = typeof parsed.category === 'string' && validSlugs.has(parsed.category)
    ? parsed.category
    : null;
  category = preferSpecificCategory(article, category, validSlugs);

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
Quando houver boas matérias em diferentes categorias, preserve variedade entre Tecnologia, IA, Desenvolvimento, Games e Inovação.
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
