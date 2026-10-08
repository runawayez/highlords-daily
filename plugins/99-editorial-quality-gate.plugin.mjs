import { categories, editorial } from "../src/config.mjs";
import { validateNewsletterContract } from "../src/editorial/edition.mjs";

const optionalDailyCategories = new Set([
  "esports",
  "entretenimento",
  "esportes",
  "ciencia-saude",
  "clima-futuro",
]);

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
  const isOptional = (item) =>
    editorial.preset === "br" && optionalDailyCategories.has(item.slug);
  const uncovered = missing.filter(
    (item) => item.reason !== "lead-only" && !isOptional(item),
  );
  const leadOnly = missing.filter((item) => item.reason === "lead-only");
  const optionalMissing = missing.filter(
    (item) => item.reason !== "lead-only" && isOptional(item),
  );

  // A category represented by the main headline is considered covered without
  // duplicating the same story in a section. Core categories remain mandatory;
  // secondary BR sections only appear when the day has a strong candidate.
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
    optionalMissingCategories: optionalMissing,
    missingCategories: optionalMissing,
  };

  if (optionalMissing.length) {
    console.log(
      `  Cobertura diária: opcionais sem destaque: ${optionalMissing
        .map((item) => item.name)
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
