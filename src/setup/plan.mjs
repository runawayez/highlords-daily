import fs from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { bundledSources } from "../sources/catalog.mjs";

export const languages = [
  { value: "pt-BR", label: "Português brasileiro" },
  { value: "en-US", label: "English" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "ja-JP", label: "日本語" },
  { value: "zh-CN", label: "中文" },
  { value: "ar-SA", label: "العربية" },
];
export const countries = [
  "BR",
  "US",
  "PT",
  "GB",
  "ES",
  "DE",
  "FR",
  "JP",
  "GLOBAL",
];
export const interests = [
  {
    value: "technology",
    pt: "Tecnologia, inteligência artificial e programação",
    en: "Technology, AI and programming",
    slugs: [
      "ia",
      "desenvolvimento",
      "mobile-gadgets",
      "hardware",
      "software-internet",
    ],
  },
  {
    value: "business",
    pt: "Economia e negócios",
    en: "Economy and business",
    slugs: ["economia"],
  },
  {
    value: "society",
    pt: "Política e sociedade",
    en: "Politics and society",
    slugs: ["politica-sociedade"],
  },
  {
    value: "science",
    pt: "Ciência e saúde",
    en: "Science and health",
    slugs: ["ciencia", "saude"],
  },
  {
    value: "environment",
    pt: "Meio ambiente e futuro",
    en: "Environment and future",
    slugs: ["clima-meio-ambiente", "futuro"],
  },
  {
    value: "games",
    pt: "Games e eSports",
    en: "Games and eSports",
    slugs: ["games", "esports"],
  },
  {
    value: "entertainment",
    pt: "Filmes e séries",
    en: "Movies and series",
    slugs: ["filmes-series"],
  },
  {
    value: "sports",
    pt: "Futebol e outros esportes",
    en: "Football and other sports",
    slugs: ["futebol", "esportes"],
  },
];
const focusMap = {
  tecnologia: ["mobile-gadgets", "hardware", "software-internet"],
  "ia-desenvolvimento": ["ia", "desenvolvimento"],
  entretenimento: ["filmes-series"],
  "ciencia-saude": ["ciencia", "saude"],
  "clima-futuro": ["clima-meio-ambiente", "futuro"],
};

export function countryName(code, language = "pt") {
  if (code === "GLOBAL")
    return language === "pt"
      ? "Mundo / notícias internacionais"
      : "World / international news";
  return new Intl.DisplayNames([language], { type: "region" }).of(code);
}
export function resolveCountry(name, language = "pt") {
  const key = (text) =>
    String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const needle = key(name);
  if (["eua", "usa", "estados unidos", "united states"].includes(needle))
    return "US";
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      for (const locale of [language, "pt", "en"]) {
        const label = countryName(code, locale);
        if (label !== code && key(label) === needle) return code;
      }
    }
  return null;
}

export async function buildSetupPlan(preferences, catalog = bundledSources()) {
  const selected = new Set(preferences.interests);
  if (
    !selected.size ||
    [...selected].some(
      (value) => !interests.some((item) => item.value === value),
    )
  )
    throw new Error("Choose at least one supported subject.");
  const requestedSlugs = new Set(
    interests
      .filter((item) => selected.has(item.value))
      .flatMap((item) => item.slugs),
  );
  const taxonomy = parseYaml(
    await fs.readFile(
      new URL("../../presets/global/categories.yml", import.meta.url),
      "utf8",
    ),
  ).categories;
  const categories = taxonomy
    .filter((category) => requestedSlugs.has(category.slug))
    .map((category) => ({ ...category, required: false }));
  const coverage = [...new Set(preferences.coverage)];
  if (!coverage.length) throw new Error("Choose at least one country.");
  const normalized = new Map();
  for (const feed of catalog) {
    if (feed.enabled === false) continue;
    const isWorld = !feed.country && (feed.coverage || []).includes("GLOBAL");
    const local =
      coverage.includes("GLOBAL") ||
      coverage.includes(feed.country) ||
      coverage.some((code) => (feed.coverage || []).includes(code));
    if (!local && !isWorld) continue;
    let focus = (feed.focus || []).flatMap((slug) => focusMap[slug] || [slug]);
    if (feed.country === "BR" && focus.includes("esportes"))
      focus.push("futebol");
    const before = focus.length;
    focus = [...new Set(focus.filter((slug) => requestedSlugs.has(slug)))];
    if (before && !focus.length) continue;
    const source = {
      ...feed,
      focus,
      images: feed.images ?? "auto",
      language: feed.language || null,
    };
    if (!focus.length) source.strict_focus = false;
    if (!normalized.has(feed.url)) normalized.set(feed.url, source);
  }
  const sources = [...normalized.values()].sort((a, b) => {
    const rank = (feed) => (coverage.includes(feed.country) ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
  if (!sources.length)
    throw new Error("No sources are available for these preferences.");
  return {
    preferences,
    categories,
    sources,
    coverage,
    localCountries: coverage.filter((code) =>
      sources.some((feed) => feed.country === code),
    ),
  };
}
