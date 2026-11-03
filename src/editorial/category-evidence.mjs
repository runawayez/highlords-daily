import { decision } from "./audit.mjs";
import { normalizeText } from "../utils/text.mjs";
import { isEsports } from "./esports.mjs";

function supportsSource(article) {
  const language = String(article.language || "und")
    .toLowerCase()
    .split("-")[0];
  return (
    ["pt", "en"].includes(language) ||
    (language === "und" &&
      !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Arabic}]/u.test(
        article.originalTitle || "",
      ))
  );
}

// Deliberately narrow contradictions, using original source titles only.
// A publisher's focus and generated copy are never evidence of a topic.
export function categoryEvidence(article, taxonomy) {
  if (!supportsSource(article)) return null;
  const slugs = new Set(taxonomy.map((category) => category.slug));
  const title = normalizeText(article.originalTitle || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const available = (...choices) => choices.find((slug) => slugs.has(slug));
  if (isEsports(article)) return available("esports") || null;
  if (
    /\b(galaxy|iphone|xiaomi|smartphone|celular)\b/.test(title) &&
    /\b(ultra|pro|design|lancamento|versao global|vazado|modelo|camera)\b/.test(
      title,
    )
  )
    return available("mobile-gadgets", "tecnologia") || null;
  if (
    /\b(compilando html|compilador|compiler|framework|biblioteca)\b/.test(
      title,
    ) &&
    /\b(pitch|rust|html|programacao|programming)\b/.test(title)
  )
    return available("desenvolvimento", "ia-desenvolvimento") || null;
  if (
    article.category === "esportes" &&
    /\b(barcelona|scotland|escocia|premier league|brasileirao)\b/.test(title) &&
    /\b(flick|jogadores|players|nations league|tecnico|liga|futebol)\b/.test(
      title,
    )
  )
    return available("futebol", "esportes") || null;

  if (
    /\b(macbook|notebook|laptop|geforce|radeon|ryzen)\b/.test(title) &&
    /\b(anuncia|lanca|lancamento|apresenta|announces|launches|unveils|oled|processador|gpu)\b/.test(
      title,
    )
  )
    return available("hardware", "tecnologia") || null;
  if (
    /\b(netflix|disney\+?|prime video|hbo|max)\b/.test(title) &&
    /\b(lancamentos|estreias|filmes|series|temporada|trailers?|premieres|movies|shows|season)\b/.test(
      title,
    )
  )
    return available("filmes-series", "entretenimento") || null;
  if (
    /\b(mario kart|zelda|playstation|xbox|nintendo|switch 2)\b/.test(title) &&
    /\b(rodar|roda|jailbreak|emulador|emulacao|gameplay|dlc|runs|emulator|emulation)\b/.test(
      title,
    )
  )
    return available("games") || null;
  return null;
}

export function enforceCategoryEvidence(articles, taxonomy) {
  return articles.flatMap((article) => {
    const category = categoryEvidence(article, taxonomy);
    if (
      category &&
      article.strictFocus &&
      article.focus?.length &&
      !article.focus.includes(category)
    ) {
      decision(article, "category-evidence", "strict-focus-content-mismatch", {
        category,
      });
      return [];
    }
    // An eSports label always needs competitive evidence, even after review.
    if (
      !category &&
      supportsSource(article) &&
      article.category === "esports" &&
      !isEsports(article)
    ) {
      decision(
        article,
        "category-evidence",
        "esports-without-competitive-evidence",
      );
      return [];
    }
    if (category && category !== article.category)
      decision(article, "category-evidence", "corrected", {
        categoryBefore: article.category,
        category,
      });
    return [
      {
        ...article,
        ...(category
          ? {
              category,
              categoryEvidence: "original-source-content",
              ...(category !== article.category
                ? {
                    editorialCategoryCorrection: `${article.category}->${category}`,
                  }
                : {}),
            }
          : {}),
      },
    ];
  });
}
