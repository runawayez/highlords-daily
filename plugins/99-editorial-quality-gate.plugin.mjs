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
  edition.stats.qualityGate = {
    passed: true,
    configuredCategories: categories.length,
    visibleSections: edition.sections?.length || 0,
    missingCategories: missing,
  };

  if (missing.length) {
    console.log(
      `  Editorial coverage: ${edition.sections?.length || 0}/${categories.length} seção(ões); ausentes: ${missing
        .map((item) => `${item.name} (${item.reason})`)
        .join(", ")}.`,
    );
  }

  return { ...payload, edition };
}

export default {
  name: "Editorial Quality Gate",
  fatal: true,
  beforeRender,
};
