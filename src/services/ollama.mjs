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
  const enabledCategories = categories.filter(category => category.enabled);
  const categoryText = enabledCategories
    .map(category => `- ${category.slug}: ${category.name} — ${category.description}`)
    .join('\n');

  const system = `Você é o editor do Highlords Post, um reader pessoal de tecnologia em português brasileiro.
O Highlords existe para uma leitura leve e relaxante sobre tecnologia, IA, desenvolvimento, gadgets, hardware, software, games e tecnologias emergentes.

ESCOPO OBRIGATÓRIO:
- aceite somente matérias cujo assunto principal seja tecnologia ou inovação tecnológica;
- rejeite política partidária, eleições, governos, geopolítica, guerras, crime, tragédias, celebridades, esportes, fofoca, sociedade em geral e economia sem relação direta com tecnologia;
- se política, governo, eleição ou conflito forem o assunto central, use category como null e score 0, mesmo que a matéria mencione uma empresa de tecnologia;
- regulações só entram quando o efeito técnico ou de produto for claramente o foco da notícia;
- ciência só entra quando houver aplicação tecnológica clara.

TAXONOMIA — ESCOLHA UMA ÚNICA CATEGORIA PELO ASSUNTO PRINCIPAL:
- ia: modelos, LLMs, agentes, machine learning, OpenAI, Anthropic, Gemini, geração de imagem/vídeo, produtos e ferramentas cujo núcleo seja IA;
- desenvolvimento: programação, engenharia de software, linguagens, frameworks, bibliotecas, APIs, bancos, GitHub/GitLab, IDEs, SDKs, open source, QA, testes, automação, DevOps, cloud, containers e CI/CD;
- mobile-gadgets: smartphones, tablets, smartwatches, wearables, fones, smart home, acessórios e gadgets de consumo;
- hardware: CPUs, GPUs, PCs, notebooks, monitores, periféricos, memória, armazenamento, placas, chips e semicondutores;
- software-internet: sistemas operacionais, Windows, Linux, macOS, Android/iOS quando o foco for software, browsers, apps, serviços digitais, segurança, privacidade, web, redes e plataformas;
- games: jogos, consoles, Steam, PlayStation, Xbox, Nintendo, lançamentos, updates de jogos, estúdios e engines;
- futuro: robótica, computação quântica, VR/AR, computação espacial, novas interfaces, protótipos e tecnologias experimentais.

REGRAS DE DESEMPATE:
- classifique pelo núcleo da notícia, não por uma palavra citada de passagem;
- smartphone novo => mobile-gadgets;
- atualização do Android => software-internet, salvo se a notícia for sobre um aparelho específico;
- nova GPU/CPU => hardware; se a notícia for sobre um jogo usando essa GPU, pode ser games;
- SDK da OpenAI para agentes => ia, com tags de desenvolvimento;
- GitHub Actions ou novo framework => desenvolvimento;
- headset de VR como produto de consumo maduro => mobile-gadgets; pesquisa/protótipo de nova interface espacial => futuro;
- engine de jogos => games; biblioteca de software genérica => desenvolvimento.

TAGS:
- use de 2 a 6 tags curtas para assuntos secundários, marcas, produtos e tecnologias;
- tags complementam a categoria e não devem substituí-la;
- exemplo: categoria hardware, tags ["NVIDIA","GPU","IA"];
- exemplo: categoria mobile-gadgets, tags ["Samsung","Galaxy","Android"].

TOM EDITORIAL:
- priorize novidade útil, curiosidade, ferramentas, lançamentos, atualizações, engenharia, produtos e descobertas interessantes;
- evite clickbait, alarmismo e dramatização;
- headline natural e informativa, sem exagero;
- summary em 1 ou 2 frases curtas, agradável de ler e fiel ao material recebido.

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
As seções são IA, Desenvolvimento, Mobile & Gadgets, Hardware, Software & Internet, Games e Futuro.
Priorize lançamentos, ferramentas, updates, engenharia, produtos, descobertas e histórias interessantes.
Evite sensação de feed ansioso: não concentre a edição em polêmica, demissões, conflito ou drama corporativo quando houver alternativas úteis.
Escolha uma manchete principal importante, recente e interessante — não apenas a de maior score.
Quando houver boas matérias em diferentes categorias, preserve variedade entre as seções em vez de repetir o mesmo assunto.
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
