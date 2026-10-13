import { config } from "../src/config.mjs";

function baseLanguage(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceBackedTags(article) {
  const haystack = normalize(
    `${article?.originalTitle || ""} ${article?.excerpt || ""}`,
  );
  if (!haystack) return [];
  return (Array.isArray(article?.tags) ? article.tags : [])
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .filter((tag) => {
      const needle = normalize(tag);
      return needle && haystack.includes(needle);
    })
    .slice(0, 6);
}

export function applyCopyIntegrity(article, targetLanguage = config.language) {
  if (!article) return article;

  const sourceLanguage = baseLanguage(article.language);
  const outputLanguage = baseLanguage(targetLanguage);
  if (!sourceLanguage || !outputLanguage || sourceLanguage !== outputLanguage)
    return article;

  const originalTitle = String(article.originalTitle || "").trim();
  const originalExcerpt = String(article.excerpt || "").trim();

  return {
    ...article,
    headline: (originalTitle || article.headline || "").slice(0, 220),
    summary: (originalExcerpt || article.summary || "").slice(0, 900),
    tags: sourceBackedTags(article),
    copyIntegrity: "source-preserved",
  };
}

export function afterAnalyze(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  if (!input.length) return payload;

  let restored = 0;
  const articles = input.map((article) => {
    const result = applyCopyIntegrity(article);
    if (result?.copyIntegrity === "source-preserved") restored += 1;
    return result;
  });

  if (restored) {
    console.log(
      `  Copy integrity: ${restored} matéria(s) no idioma da edição preservaram título e resumo da fonte.`,
    );
  }

  return { ...payload, articles, copyIntegrity: { restored } };
}

export default {
  name: "Copy Integrity",
  afterAnalyze,
};
