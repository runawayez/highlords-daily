import { categories } from "../../src/config.mjs";

const validSlugs = new Set(categories.map((category) => category.slug));

// Built-in presets no longer classify stories with language-specific keyword
// rules. Semantic category assignment belongs to Ollama. This hook remains as
// a lightweight structural extension point for source constraints and custom
// presets without changing the universal editorial behavior.
export function applyEditorialGuardrails(article) {
  const focus = Array.isArray(article?.focus)
    ? article.focus.filter((slug) => validSlugs.has(slug))
    : [];
  const strictFocus = Boolean(article?.strictFocus && focus.length);
  const singleCategoryLock = strictFocus && focus.length === 1;

  return {
    ...article,
    focus,
    strictFocus,
    ...(singleCategoryLock
      ? { editorialGuardrail: "strict-single-category-source" }
      : {}),
  };
}
