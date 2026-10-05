import { config } from '../config.mjs';

export async function checkOllama() {
  try {
    const response = await fetch(`${config.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models.map(model => model.name) : [];
    return {
      ok: true,
      model: config.ollamaModel,
      modelAvailable: models.some(name => name.startsWith(config.ollamaModel))
    };
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

  const system = `Você é um editor do Highlords Daily, uma newsletter diária de tecnologia em português brasileiro.
O objetivo é selecionar conteúdo útil, interessante e agradável para alguém que quer se atualizar sem política e sem excesso de ruído.

ESCOPO OBRIGATÓRIO:
- aceite somente matérias cujo assunto principal seja tecnologia ou inovação tecnológica;
- rejeite política partidária, eleições, governos, geopolítica, guerras, crime, tragédias, celebridades, esportes, fofoca e economia sem relação direta com tecnologia;
- se política, governo, eleição ou conflito forem o assunto central, use category como null e score 0, mesmo que uma empresa de tecnologia seja citada;
- regulações só entram quando o efeito técnico, de produto ou de plataforma for claramente o foco;
- ciência só entra quando houver aplicação tecnológica clara.

TAXONOMIA FIXA — ESCOLHA UMA ÚNICA CATEGORIA PELO ASSUNTO PRINCIPAL:
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
- nova GPU/CPU => hardware;
- SDK da OpenAI para agentes => ia, com tags de desenvolvimento;
- GitHub Actions ou novo framework => desenvolvimento;
- headset de VR já comercial => mobile-gadgets; pesquisa/protótipo de nova interface espacial => futuro;
- engine de jogos => games; biblioteca de software genérica => desenvolvimento.

TAGS:
- use de 2 a 6 tags curtas para assuntos secundários, marcas, produtos e tecnologias;
- tags complementam a categoria e não devem substituí-la.

TOM EDITORIAL:
- priorize novidade útil, lançamentos, atualizações, engenharia, produtos, ferramentas, descobertas e histórias interessantes;
- evite clickbait, alarmismo e dramatização;
- headline natural, curta e informativa;
- summary em 1 ou 2 frases curtas, fiel ao material recebido.

Nunca invente fatos, números, datas, citações ou contexto ausente.
Use apenas o título, a fonte e o trecho fornecidos.
Escreva headline e summary sempre em português brasileiro.
Se a matéria não se encaixar claramente no escopo, use category como null e score 0.
Score vai de 0 a 10 e mede a importância e o valor da matéria para a newsletter do dia.
Retorne SOMENTE JSON válido com este formato:
{"headline":"string","summary":"string","category":"slug-ou-null","score":0,"tags":["tag"]}`;

  const user = `Categorias disponíveis:\n${categoryText}\n\nNotícia:\n${JSON.stringify({
    source: article.source,
    title: article.originalTitle,
    excerpt: article.excerpt
  })}`;

  const parsed = await chatJson(system, user);
  const validSlugs = new Set(categories.filter(category => category.enabled).map(category => category.slug));
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

export async function curateDailyNewsletter(articles, categories, editionDate) {
  const compactArticles = articles.slice(0, 100).map(article => ({
    id: article.id,
    category: article.category,
    score: article.score,
    source: article.source,
    publishedAt: article.publishedAt,
    headline: article.headline || article.originalTitle,
    summary: article.summary,
    tags: article.tags
  }));

  const categoryText = categories.map(category => ({
    slug: category.slug,
    name: category.name
  }));

  const system = `Você é o editor-chefe do Highlords Daily, uma newsletter diária e calma sobre tecnologia.
Sua tarefa é montar uma edição enxuta usando SOMENTE os IDs fornecidos.

OBJETIVO:
- escolher as notícias mais importantes, úteis e interessantes do período;
- preservar variedade entre IA, Desenvolvimento, Mobile & Gadgets, Hardware, Software & Internet, Games e Futuro;
- priorizar impacto real, novidade, relevância técnica e utilidade sobre clickbait;
- evitar repetir a mesma história, empresa ou assunto em várias seções quando houver alternativas boas;
- equilibrar fontes quando possível;
- não preencher uma seção com matéria fraca apenas para ocupar espaço.

FORMATO DA EDIÇÃO:
- escolha 1 manchete principal entre as melhores matérias de toda a edição;
- escolha no máximo 2 matérias por categoria;
- a manchete não deve reaparecer dentro de uma seção;
- todas as 7 categorias existem na newsletter, mas uma seção pode ficar vazia se não houver matéria boa o bastante;
- escreva um título editorial curto para a edição, sem sensacionalismo;
- escreva uma introdução de 2 frases no máximo explicando o que vale atenção hoje, sem inventar fatos além do material fornecido.

Retorne SOMENTE JSON válido exatamente neste formato:
{"title":"string","intro":"string","leadId":123,"sections":{"ia":[1,2],"desenvolvimento":[3],"mobile-gadgets":[],"hardware":[4],"software-internet":[5],"games":[6],"futuro":[7]}}`;

  const user = `Data da edição: ${editionDate}\nCategorias fixas: ${JSON.stringify(categoryText)}\n\nMatérias candidatas:\n${JSON.stringify(compactArticles)}`;
  return chatJson(system, user, 120000);
}
