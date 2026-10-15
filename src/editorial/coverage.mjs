import { normalizeText } from "../utils/text.mjs";
import { digest } from "../utils/storage.mjs";

export function coverageEvidence(articles) {
  const publishers = [
    ...new Set(
      articles
        .map((article) => article.publisherGroup || article.source)
        .filter(Boolean),
    ),
  ];
  const origins = new Set();
  const snippets = new Map();
  for (const article of articles) {
    const text = normalizeText(article.excerpt || "");
    if (text.length >= 80) {
      const key = digest(text);
      snippets.set(key, (snippets.get(key) || 0) + 1);
    }
    // Explicit metadata is an editorial assertion, not independent fact checking.
    if (article.reportingOrigin)
      origins.add(normalizeText(article.reportingOrigin));
  }
  return {
    coverageCount: Math.max(1, publishers.length),
    coverageSources: publishers,
    independentCoverageCount: [...snippets.values()].some((count) => count > 1)
      ? 1
      : Math.max(1, origins.size),
    coverageEvidence: {
      declaredOrigins: [...origins],
      repeatedExcerpts: [...snippets.values()].some((count) => count > 1),
      independence:
        origins.size > 1 ? "declared-multiple-origins" : "unverified-or-shared",
    },
  };
}
