import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { categories, editorial } from "../src/config.mjs";
import { validateNewsletterContract } from "../src/editorial/edition.mjs";

function requiredCategorySlugs() {
  try {
    const document = parseYaml(fs.readFileSync(editorial.categoriesFile, "utf8")) || {};
    const raw = Array.isArray(document.categories) ? document.categories : [];
    const required = raw
      .filter((category) => category && category.enabled !== false)
      .filter((category) => category.required !== false)
      .map((category) => String(category.slug || "").trim())
      .filter(Boolean);
    return new Set(required.length ? required : categories.map((category) => category.slug));
  } catch {
    return new Set(categories.map((category) => category.slug));
  }
}

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

  const required = requiredCategorySlugs();
  const missing = Array.isArray(edition?.stats?.coverage?.missing)
    ? edition.stats.coverage.missing
    : [];
  const leadOnly = missing.filter((item) => item.reason === "lead-only");
  const uncoveredRequired = missing.filter(
    (item) => item.reason !== "lead-only" && required.has(item.slug),
  );
  const optionalMissing = missing.filter(
    (item) => item.reason !== "lead-only" && !required.has(item.slug),
  );

  // Core sections are contractual. Secondary sections are opportunistic: they
  // appear only when the day has a strong, valid candidate for them.
  if (uncoveredRequired.length) {
    const error = new Error(
      `Editorial coverage incomplete: ${uncoveredRequired
        .map((item) => `${item.name} (${item.reason})`)
        .join(", ")}`,
    );
    error.fatal = true;
    throw error;
  }

  const visibleSlugs = new Set((edition.sections || []).map((section) => section.slug));
  const leadCategory = edition.lead?.category;
  const requiredCovered = [...required].filter(
    (slug) => visibleSlugs.has(slug) || slug === leadCategory,
  ).length;

  edition.stats.qualityGate = {
    passed: true,
    configuredCategories: categories.length,
    requiredCategories: required.size,
    visibleSections: edition.sections?.length || 0,
    categoriesCovered: (edition.sections?.length || 0) + leadOnly.length,
    requiredCategoriesCovered: requiredCovered,
    leadOnlyCategories: leadOnly,
    optionalMissingCategories: optionalMissing,
    missingCategories: optionalMissing,
  };

  if (optionalMissing.length) {
    console.log(
      `  Cobertura diária: ${requiredCovered}/${required.size} editorias essenciais cobertas; opcionais sem destaque: ${optionalMissing
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
