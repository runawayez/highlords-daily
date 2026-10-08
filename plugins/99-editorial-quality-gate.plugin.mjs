import { categories } from "../src/config.mjs";
import { validateNewsletterContract } from "../src/editorial/edition.mjs";

function beforeRender(payload) {
  const edition = payload?.edition;
  if (!edition) return payload;

  const result = validateNewsletterContract(edition);
  if (!result.ok) {
    const error = new Error(
      `Editorial quality gate blocked publication: ${result.errors.join(", ")}`,
    );
    error.fatal = true;
    throw error;
  }

  const missing = Array.isArray(edition?.stats?.coverage?.missing)
    ? edition.stats.coverage.missing
    : [];
  const uncovered = missing.filter((item) => item.reason !== "lead-only");
  const leadOnly = missing.filter((item) => item.reason === "lead-only");

  // A category represented by the main headline is considered covered without
  // duplicating the same story in a section. Every other configured category
  // must have at least one real selected story; incomplete editions do not ship.
  if (uncovered.length) {
    const error = new Error(
      `Editorial coverage incomplete: ${uncovered
        .map((item) => `${item.name} (${item.reason})`)
        .join(", ")}`,
    );
    error.fatal = true;
    throw error;
  }

  edition.stats.qualityGate = {
    passed: true,
    configuredCategories: categories.length,
    visibleSections: edition.sections?.length || 0,
    categoriesCovered: (edition.sections?.length || 0) + leadOnly.length,
    leadOnlyCategories: leadOnly,
    missingCategories: [],
  };

  if (leadOnly.length) {
    console.log(
      `  Editorial coverage: ${categories.length}/${categories.length} categorias cobertas; ${leadOnly
        .map((item) => item.name)
        .join(", ")} representada(s) pela manchete.`,
    );
  }

  return { ...payload, edition };
}

export default {
  name: "Editorial Quality Gate",
  fatal: true,
  beforeRender,
};
