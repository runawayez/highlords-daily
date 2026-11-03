import { normalizeText } from "../utils/text.mjs";
import { decision } from "./audit.mjs";

const families = {
  tecnologia: "technology",
  ia: "technology",
  desenvolvimento: "technology",
  "ia-desenvolvimento": "technology",
  hardware: "technology",
  "mobile-gadgets": "technology",
  "software-internet": "technology",
  games: "games",
  esports: "games",
  futebol: "sports",
  esportes: "sports",
  economia: "economy",
  "politica-sociedade": "society",
  brasil: "society",
  mundo: "world",
  "ciencia-saude": "science",
  ciencia: "science",
  saude: "science",
  "clima-futuro": "science",
  "clima-meio-ambiente": "science",
  futuro: "science",
  entretenimento: "culture",
  "filmes-series": "culture",
  cultura: "culture",
};
export const familyOrder = [
  "society",
  "world",
  "economy",
  "science",
  "technology",
  "culture",
  "sports",
  "games",
];
export function editorialFamily(article) {
  return families[article.category] || article.category;
}
export function isFootball(article) {
  if (article.category === "futebol" || article.sport === "football")
    return true;
  if (article.category !== "esportes") return false;
  const text = normalizeText(
    `${article.originalTitle || ""} ${article.excerpt || ""}`,
  )
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return (
    /\b(futebol|soccer|brasileirao|libertadores|premier league|liga dos campeoes|barcelona|flamengo|newcastle|scotland|escocia)\b/.test(
      text,
    ) && !/\b(basquete|basketball|rugby|curling|futebol americano)\b/.test(text)
  );
}
export function storyKind(article) {
  if (
    [
      "report",
      "service",
      "analysis",
      "community",
      "preview",
      "rumor",
      "reaction",
      "major-development",
    ].includes(article.storyType)
  )
    return article.storyType;
  const title = normalizeText(article.originalTitle || "");
  if (
    /\b(pitch|estou desenvolvendo|meu projeto|my project|show hn)\b/.test(title)
  )
    return "community";
  if (
    /\b(onde assistir|provaveis escalacoes|where to watch|jogos de hoje)\b/.test(
      title,
    )
  )
    return "preview";
  if (/\b(rumor|rumores|vazado|vazada|vazamento|leaked|rumoured)\b/.test(title))
    return "rumor";
  if (
    /\b(sac|direito do consumidor|atendimento humano|como solicitar|prazo para|consumer rights)\b/.test(
      title,
    )
  )
    return "service";
  return "report";
}
export function selectionScore(article) {
  const base = Number(article.sectionScore ?? article.score ?? 0) || 0;
  const penalty =
    { community: 1.2, preview: 1.1, rumor: 0.9, reaction: 0.8 }[
      storyKind(article)
    ] || 0;
  return base - penalty;
}
export function balanceStories(articles, lead, taxonomy, settings) {
  const configured = new Set(
    taxonomy.map((category) => editorialFamily({ category: category.slug })),
  );
  const floor = Math.max(4, Number(settings.llmMinScore || 4));
  const eligible = articles.filter(
    (article) => selectionScore(article) >= floor,
  );
  const represented = new Set(eligible.map(editorialFamily));
  const enabled =
    settings.editorialBalance !== "off" &&
    [...configured].filter((family) => familyOrder.includes(family)).length >=
      3 &&
    [...represented].filter((family) => familyOrder.includes(family)).length >=
      3;
  if (!enabled) return null;
  const target = Math.max(6, Number(settings.editionMaxStories || 16));
  const goals = {
    society: 3,
    world: 2,
    economy: 2,
    science: 2,
    technology: 3,
    culture: 2,
    sports: 1,
    games: 1,
  };
  const caps = {
    society: Math.ceil(target * 0.3),
    world: Math.ceil(target * 0.25),
    economy: Math.ceil(target * 0.25),
    science: Math.ceil(target * 0.25),
    culture: Math.ceil(target * 0.2),
    technology: Math.max(2, Math.ceil(target * 0.25)),
    sports: Math.max(2, Math.ceil(target * 0.18)),
    games: Math.max(1, Math.ceil(target * 0.12)),
  };
  const selected = lead ? [lead] : [];
  const counts = new Map(),
    sources = new Map(),
    sectionSources = new Map(),
    entities = new Map();
  let football = 0;
  const register = (article) => {
    const family = editorialFamily(article),
      source = article.publisherGroup || article.source;
    counts.set(family, (counts.get(family) || 0) + 1);
    sources.set(source, (sources.get(source) || 0) + 1);
    const key = `${article.category}:${source}`;
    sectionSources.set(key, (sectionSources.get(key) || 0) + 1);
    if (isFootball(article)) football++;
    for (const entity of article.editorialEntities || [])
      entities.set(entity, (entities.get(entity) || 0) + 1);
  };
  if (lead) register(lead);
  const horizon =
    Number(settings.primaryLookbackHours || settings.lookbackHours || 48) *
    3600000;
  const fresh = (article) =>
    new Date(article.publishedAt || 0).getTime() >= Date.now() - horizon;
  const sorted = eligible
    .slice()
    .sort(
      (a, b) =>
        Number(fresh(b)) - Number(fresh(a)) ||
        selectionScore(b) - selectionScore(a) ||
        Number(b.frontPageScore || 0) - Number(a.frontPageScore || 0) ||
        new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
    );
  const canAdd = (article) => {
    if (selected.some((item) => Number(item.id) === Number(article.id)))
      return false;
    const family = editorialFamily(article),
      source = article.publisherGroup || article.source;
    if ((counts.get(family) || 0) >= (caps[family] || target)) return false;
    if (isFootball(article) && football >= 2) return false;
    if (
      selected.filter((item) => item.category === article.category).length >=
      Math.max(1, settings.itemsPerCategory || 2)
    )
      return false;
    if (
      article.topicKey &&
      selected.some((item) => item.topicKey === article.topicKey)
    )
      return false;
    if (
      (article.editorialEntities || []).some(
        (entity) => (entities.get(entity) || 0) >= 2,
      )
    )
      return false;
    if (
      settings.maxItemsPerSource > 0 &&
      (sources.get(source) || 0) >= settings.maxItemsPerSource
    )
      return false;
    if (
      settings.maxItemsPerSourcePerSection > 0 &&
      (sectionSources.get(`${article.category}:${source}`) || 0) >=
        settings.maxItemsPerSourcePerSection
    )
      return false;
    return true;
  };
  const add = (article) => {
    selected.push(article);
    register(article);
  };
  // One strong story per family, then weighted targets, then best remaining.
  for (const family of [...familyOrder, ...represented]) {
    if (selected.length >= target || counts.get(family)) continue;
    const candidate = sorted.find(
      (article) => editorialFamily(article) === family && canAdd(article),
    );
    if (candidate) add(candidate);
  }
  for (let round = 1; round <= 3 && selected.length < target; round++) {
    for (const family of familyOrder) {
      if (
        selected.length >= target ||
        (counts.get(family) || 0) >= (goals[family] || 1)
      )
        continue;
      const candidate = sorted.find(
        (article) => editorialFamily(article) === family && canAdd(article),
      );
      if (candidate) add(candidate);
    }
  }
  for (const article of sorted)
    if (selected.length < target && canAdd(article)) add(article);
  // Keep the share meaningful even on a short day: a 16-story budget must
  // not permit four technology stories in an otherwise sparse six-story issue.
  while (
    selected.filter((article) => editorialFamily(article) === "technology")
      .length > Math.max(1, Math.floor(selected.length * 0.25))
  ) {
    const removable = selected
      .filter(
        (article) =>
          article.id !== lead?.id && editorialFamily(article) === "technology",
      )
      .sort((a, b) => selectionScore(a) - selectionScore(b))[0];
    if (!removable) break;
    selected.splice(selected.indexOf(removable), 1);
  }
  // Recompute diagnostics after share correction (lead remains immutable).
  counts.clear();
  for (const article of selected)
    counts.set(
      editorialFamily(article),
      (counts.get(editorialFamily(article)) || 0) + 1,
    );
  football = selected.filter(isFootball).length;
  for (const article of articles)
    if (!selected.some((item) => item.id === article.id))
      decision(
        article,
        "balance",
        selectionScore(article) < floor
          ? "below-editorial-floor"
          : "theme-source-entity-or-edition-limit",
      );
  const distribution = Object.fromEntries(
    [...counts].map(([family, count]) => [
      family,
      { count, share: Number((count / selected.length).toFixed(3)) },
    ]),
  );
  return {
    articles: selected,
    stats: {
      enabled: true,
      target,
      actual: selected.length,
      familyCount: counts.size,
      distribution,
      football,
      technologyCap: caps.technology,
      floor,
      unfilled: Math.max(0, target - selected.length),
    },
  };
}
