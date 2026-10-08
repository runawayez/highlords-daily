import { categories, config, profile, publication } from "../config.mjs";
import { requestChat } from "../services/ollama-client.mjs";

const MAX_EDITOR_CANDIDATES = 80;

function score(article, field, fallback = "score") {
  const value = Number(article?.[field] ?? article?.[fallback] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function editorialSort(a, b) {
  return (
    score(b, "frontPageScore") - score(a, "frontPageScore") ||
    score(b, "sectionScore") - score(a, "sectionScore") ||
    new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );
}

function frontPagePool(articles) {
  const selected = [];
  const ids = new Set();
  const perCategory = Math.max(2, config.itemsPerCategory + 1);

  for (const category of categories) {
    const candidates = articles
      .filter((article) => article.category === category.slug)
      .slice()
      .sort(editorialSort)
      .slice(0, perCategory);
    for (const article of candidates) {
      if (ids.has(article.id)) continue;
      selected.push(article);
      ids.add(article.id);
    }
  }

  for (const article of articles.slice().sort(editorialSort)) {
    if (selected.length >= MAX_EDITOR_CANDIDATES) break;
    if (ids.has(article.id)) continue;
    selected.push(article);
    ids.add(article.id);
  }

  return selected.slice(0, MAX_EDITOR_CANDIDATES);
}

export async function curateFrontPage(curated, articles, editionDate) {
  const pool = frontPagePool(articles);
  if (!pool.length) return {};

  const validIds = pool.map((article) => Number(article.id));
  const validSlugs = categories.map((category) => category.slug);
  const taxonomy = categories
    .map(
      (category) =>
        `- ${category.slug}: ${category.name} — ${category.description}`,
    )
    .join("\n");
  const compact = pool.map((article) => ({
    id: article.id,
    category: article.category,
    frontPageScore: article.frontPageScore ?? article.score,
    sectionScore: article.sectionScore ?? article.score,
    source: article.source,
    publishedAt: article.publishedAt,
    topicKey: article.topicKey,
    headline: article.headline,
    summary: article.summary,
  }));

  const system = `Você é o editor de primeira página do ${publication.name}.
Sua função é definir HIERARQUIA EDITORIAL para uma edição diária. A classificação das matérias já foi feita e NÃO deve ser alterada.

CONTEXTO:
- idioma da edição: ${config.language};
- contexto editorial: ${config.editorialContext};
- perfil: ${profile.name} — ${profile.description};
- categorias prioritárias do perfil: ${profile.priorityCategories.length ? profile.priorityCategories.join(", ") : "nenhuma; equilíbrio geral"}.

CATEGORIAS CONFIGURADAS:
${taxonomy}

REGRAS:
- escolha de 3 a 5 topStoryIds quando houver candidatas suficientes; são os assuntos que uma pessoa deveria saber antes de navegar pelas seções;
- NÃO inclua a manchete principal nos topStoryIds;
- priorize impacto, utilidade, novidade, relevância para o contexto editorial e diversidade temática; frontPageScore e sectionScore são sinais fortes, não ordens cegas;
- evite top stories sobre o mesmo acontecimento/topicKey;
- prefira top stories de categorias diferentes quando a qualidade for comparável;
- sectionOrder é uma SUBLISTA ordenada das categorias que realmente merecem seção nesta edição;
- NÃO inclua uma categoria apenas para preencher espaço. Se as pautas de uma categoria estiverem fracas ou redundantes, omita-a de sectionOrder;
- ordene as seções por importância editorial DO DIA, não pela ordem fixa da taxonomia;
- frontPageTitle é um rótulo curto e natural para o bloco de destaques gerais, escrito em ${config.language} (por exemplo, o equivalente local de “O que importa hoje”);
- use somente IDs e slugs fornecidos; não invente fatos ou categorias;
- devolva somente JSON válido.`;

  const schema = {
    type: "object",
    properties: {
      frontPageTitle: { type: "string" },
      topStoryIds: {
        type: "array",
        maxItems: 5,
        uniqueItems: true,
        items: { type: "integer", enum: validIds },
      },
      sectionOrder: {
        type: "array",
        maxItems: validSlugs.length,
        uniqueItems: true,
        items: { type: "string", enum: validSlugs },
      },
    },
    required: ["frontPageTitle", "topStoryIds", "sectionOrder"],
    additionalProperties: false,
  };

  return requestChat(
    system,
    JSON.stringify({
      editionDate,
      leadId: Number(curated?.leadId) || null,
      currentSections: curated?.sections || {},
      candidates: compact,
    }),
    { timeoutMs: 150000, schema },
  );
}
