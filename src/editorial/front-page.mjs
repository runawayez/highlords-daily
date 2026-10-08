import { config, profile, publication } from "../config.mjs";
import { requestChat } from "../services/ollama-client.mjs";
import { uiCatalog } from "../services/i18n.mjs";

const MAX_EDITOR_CANDIDATES = 40;
const internalIntroPattern =
  /\b(?:frontPageScore|sectionScore|topicKey|topStoryIds|sectionOrder|leadId|ollama|pipeline|score)\b/i;

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

function curatedSectionIds(curated) {
  const values = Object.values(curated?.sections || {}).flat();
  return new Set(
    values
      .map((value) => Number(value?.id ?? value))
      .filter((value) => Number.isFinite(value)),
  );
}

function frontPagePool(curated, articles) {
  const sectionIds = curatedSectionIds(curated);
  const base = sectionIds.size
    ? articles.filter((article) => sectionIds.has(Number(article.id)))
    : articles;
  return base.slice().sort(editorialSort).slice(0, MAX_EDITOR_CANDIDATES);
}

function readerFacingIntro(value) {
  const text = String(value || "").trim();
  return text.length >= 24 && !internalIntroPattern.test(text);
}

async function rewriteIntro(currentIntro, compact, editionDate) {
  const fallback = uiCatalog().fallbackIntro;
  const schema = {
    type: "object",
    properties: { intro: { type: "string" } },
    required: ["intro"],
    additionalProperties: false,
  };
  try {
    const response = await requestChat(
      `Você é o editor de abertura do ${publication.name}.
Reescreva uma abertura jornalística curta para o LEITOR, em ${config.language}, natural para ${config.editorialContext}.
Use 2 ou 3 frases e resuma os principais assuntos do dia com base SOMENTE nas matérias fornecidas.
NÃO descreva análise, classificação, seleção, quantidade de artigos, categorias como estrutura do sistema, scores, campos internos, IA, modelo, pipeline ou primeira página.
NÃO invente fatos. Devolva somente JSON válido.`,
      JSON.stringify({
        editionDate,
        currentIntro,
        stories: compact.slice(0, 10),
      }),
      { timeoutMs: 90000, schema },
    );
    return readerFacingIntro(response?.intro)
      ? response.intro.trim()
      : fallback;
  } catch {
    return fallback;
  }
}

export async function curateFrontPage(curated, articles, editionDate) {
  const pool = frontPagePool(curated, articles);
  if (!pool.length) return {};

  const validIds = pool.map((article) => Number(article.id));
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

  const system = `Você é o editor de destaques do ${publication.name}.
A estrutura por categorias JÁ ESTÁ DEFINIDA e não deve ser alterada. Sua função é somente escolher os destaques gerais da edição e entregar uma abertura jornalística para o leitor.

CONTEXTO:
- idioma da edição: ${config.language};
- contexto editorial: ${config.editorialContext};
- perfil: ${profile.name} — ${profile.description};
- categorias prioritárias do perfil: ${profile.priorityCategories.length ? profile.priorityCategories.join(", ") : "nenhuma; equilíbrio geral"}.

REGRAS:
- escolha de 3 a 5 topStoryIds quando houver candidatas suficientes;
- NÃO inclua a manchete principal nos topStoryIds;
- escolha SOMENTE entre as matérias que já pertencem às seções da edição; os destaques são referências, não uma coleção separada;
- priorize impacto, utilidade, novidade, relevância para o contexto editorial e diversidade temática; frontPageScore e sectionScore são sinais fortes, não ordens cegas;
- evite destaques sobre o mesmo acontecimento/topicKey;
- prefira categorias diferentes quando a qualidade for comparável;
- intro deve ter 2 ou 3 frases, falar diretamente ao leitor e resumir os principais assuntos do dia;
- intro NÃO pode explicar o processo de seleção, mencionar quantidade de artigos, scores, campos internos, IA, modelo, pipeline, classificação ou “front page”;
- escreva intro em ${config.language}, natural para ${config.editorialContext};
- use somente IDs fornecidos e não invente fatos;
- devolva somente JSON válido.`;

  const schema = {
    type: "object",
    properties: {
      intro: { type: "string" },
      topStoryIds: {
        type: "array",
        maxItems: 5,
        uniqueItems: true,
        items: { type: "integer", enum: validIds },
      },
    },
    required: ["intro", "topStoryIds"],
    additionalProperties: false,
  };

  const result = await requestChat(
    system,
    JSON.stringify({
      editionDate,
      leadId: Number(curated?.leadId) || null,
      currentIntro: curated?.intro || "",
      candidates: compact,
    }),
    { timeoutMs: 150000, schema },
  );

  if (!readerFacingIntro(result?.intro)) {
    result.intro = await rewriteIntro(
      curated?.intro || result?.intro,
      compact,
      editionDate,
    );
  } else {
    result.intro = result.intro.trim();
  }
  return result;
}
