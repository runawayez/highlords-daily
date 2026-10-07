import { normalizeText } from "../src/utils/text.mjs";
import { isEsports, generalGameSignal } from "../src/editorial/esports.mjs";
import { categories, config } from "../src/config.mjs";

const slugs = new Set(categories.map((category) => category.slug));

function routeCollected(article) {
  if (!config.bundledTaxonomy || !slugs.has("esports") || !isEsports(article))
    return article;
  return {
    ...article,
    focus: ["esports"],
    strictFocus: true,
    editorialGuardrail: "clear-esports-signal",
  };
}

function validateAnalyzed(article) {
  if (
    !config.bundledTaxonomy ||
    !slugs.has("esports") ||
    (article.language &&
      !["und", "pt", "en"].includes(article.language.split("-")[0]))
  )
    return article;

  if (isEsports(article)) {
    return {
      ...article,
      focus: ["esports"],
      strictFocus: true,
      category: "esports",
      editorialGuardrail: "clear-esports-signal",
    };
  }

  if (article?.category !== "esports") return article;

  const originalFocus = Array.isArray(article.focus) ? article.focus : [];
  const text = normalizeText(
    `${article.originalTitle || ""} ${article.excerpt || ""}`,
  );
  if (
    slugs.has("games") &&
    originalFocus.includes("games") &&
    generalGameSignal.test(text)
  ) {
    return {
      ...article,
      category: "games",
      editorialGuardrail: "false-esports-rerouted-to-games",
    };
  }

  return null;
}

function afterCollect(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  let routed = 0;
  const articles = input.map((article) => {
    const next = routeCollected(article);
    if (next !== article) routed += 1;
    return next;
  });
  if (routed)
    console.log(
      `  eSports: ${routed} candidata(s) com evidência competitiva roteada(s).`,
    );
  return { ...payload, articles };
}

function afterAnalyze(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  let confirmed = 0;
  let corrected = 0;
  let dropped = 0;
  const articles = [];

  for (const article of input) {
    const wasEsports = article?.category === "esports";
    const next = validateAnalyzed(article);
    if (!next) {
      if (wasEsports) dropped += 1;
      continue;
    }
    if (next.category === "esports" && isEsports(next)) confirmed += 1;
    if (wasEsports && next.category !== "esports") corrected += 1;
    articles.push(next);
  }

  if (confirmed || corrected || dropped) {
    console.log(
      `  eSports: ${confirmed} confirmada(s) · ${corrected} corrigida(s) para Games · ${dropped} descartada(s) sem evidência competitiva.`,
    );
  }
  return { ...payload, articles };
}

export default {
  name: "eSports Routing",
  afterCollect,
  afterAnalyze,
};
