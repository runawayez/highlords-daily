import { digest } from "../utils/storage.mjs";
import { sourceSummary } from "./summary.mjs";
import { limitCopy } from "./source-text.mjs";

function numbers(text) {
  // Preserve the unit/currency marker to avoid treating 5% as the same as $5.
  return [
    ...String(text).matchAll(
      /(?:[R$€£¥]+\s*)?\d+(?:[.,:/-]\d+)*(?:\s*[%€£¥]|\s*(?:milh[oõ]es|bilh[oõ]es|million|billion))?/giu,
    ),
  ].map(([value]) => value.replace(/\s+/g, "").toLowerCase());
}

export function assessCopy(article) {
  const source =
    `${article.originalTitle || ""}\n${article.excerpt || ""}`.trim();
  const copy = `${article.headline || ""}\n${article.summary || ""}`.trim();
  const backed = new Set(numbers(source));
  const unsupportedNumbers = [
    ...new Set(numbers(copy).filter((value) => !backed.has(value))),
  ];
  return {
    source: {
      link: article.link || "",
      title: article.originalTitle || "",
      excerpt: article.excerpt || "",
      digest: digest(source),
    },
    status: !source
      ? "insufficient-source"
      : unsupportedNumbers.length
        ? "needs-review"
        : "no-numeric-conflict-detected",
    unsupportedNumbers,
    // This is a limited consistency check, never a factual verification score.
    limitations: [
      "Names, causality and semantic equivalence require editorial review.",
    ],
  };
}

export function enforceCopyProvenance(article, language = "en") {
  const assessment = assessCopy(article);
  const sameLanguage =
    article.language &&
    article.language !== "und" &&
    article.language.split(/[-_]/)[0] === language.split(/[-_]/)[0];
  const needsFallback = assessment.status !== "no-numeric-conflict-detected";
  if (needsFallback && article.originalTitle) {
    const result = {
      ...article,
      headline: limitCopy(
        article.originalTitle,
        220,
        article.language || language,
      ),
      summary: sourceSummary(article.excerpt, article.language || language),
    };
    return {
      ...result,
      provenance: {
        ...assessCopy(result),
        action: "source-fallback",
        languageFallback: !sameLanguage,
        originalIssues: assessment.unsupportedNumbers,
      },
    };
  }
  return {
    ...article,
    provenance: {
      ...assessment,
      action: needsFallback ? "review-required" : "retained",
    },
  };
}
