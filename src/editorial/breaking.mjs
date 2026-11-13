import { normalizeText } from "../utils/text.mjs";
import { decision } from "./audit.mjs";
import { editorialFamily } from "./balance.mjs";

// Cross-desk event detection.
//
// A small local model judges each story in isolation, so a story that the whole
// press is covering (an outage, a resignation, a disaster) can look "routine"
// to it. The number of independent publishers covering the same event on
// different desks is a strong, model-free importance signal. This module
// detects those events BEFORE analysis, so strict-focus filters and score
// thresholds cannot silently throw the day's biggest story away.
//
// It measures coverage, not truth: a cluster says "many outlets are writing
// about this", never "this is verified".

const STOPWORDS = new Set(
  (
    "para como mais sobre apos entre sobre nesta neste esta este essa esse isso " +
    "pelo pela pelos pelas seus suas dele dela quando onde porque pois muito " +
    "ainda agora hoje ontem veja saiba entenda confira segundo diz dizem faz " +
    "fazem tem tens vai vao foi foram sao ser esta estao pode podem deve devem " +
    "novo nova novos novas todo toda todos todas outro outra outros outras " +
    "apenas tambem depois antes durante contra sem sob ate desde cada mesmo " +
    "with from that this have been will after about their they were what when " +
    "into than then them also over more most some such only your"
  ).split(" "),
);

const DEFAULTS = {
  windowHours: 36,
  minSharedTokens: 2,
  maxDocumentFrequency: 0.1,
  coreShare: 0.35,
  notablePublishers: 4,
  majorPublishers: 6,
  singleDeskPublishers: 7,
  maxClusters: 4,
  maxRepresentatives: 10,
};

function strip(value) {
  return normalizeText(value).normalize("NFD").replace(/\p{M}/gu, "");
}

function stem(token) {
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

export function titleTokens(article) {
  return new Set(
    strip(article.originalTitle || article.headline || "")
      .split(" ")
      .filter(
        (token) =>
          token.length >= 4 && !STOPWORDS.has(token) && !/^\d+$/.test(token),
      )
      .map(stem),
  );
}

function publisherOf(article) {
  return strip(article.publisherGroup || article.source || "");
}

function primaryFamily(article) {
  const focus = Array.isArray(article.focus) ? article.focus : [];
  return focus.length ? editorialFamily({ category: focus[0] }) : null;
}

export function isBreaking(article) {
  return Boolean(article?.breaking?.level);
}

// Minimum model score for a story the press is covering massively. The model
// score stays recorded separately as `modelScoreBeforeBreaking`.
export function breakingFloor(article) {
  const level = article?.breaking?.level;
  if (level === "major") return 7.5;
  if (level === "notable") return 6;
  return 0;
}

// Added to the final ranking scores (after global calibration).
export function breakingLift(article) {
  const level = article?.breaking?.level;
  if (level === "major") return { front: 2.5, section: 1.5 };
  if (level === "notable") return { front: 1.2, section: 0.8 };
  return { front: 0, section: 0 };
}

// If a strict-focus source got a category outside its declared focus, a
// breaking story is remapped to the source's closest allowed category instead
// of being dropped. Returns null when nothing valid exists.
export function remapToFocus(article, taxonomy) {
  const slugs = new Set(taxonomy.map((category) => category.slug));
  const allowed = (article.focus || []).filter((slug) => slugs.has(slug));
  return allowed[0] || null;
}

function cluster(articles, options) {
  const tokens = articles.map(titleTokens);
  const documentFrequency = new Map();
  for (const set of tokens)
    for (const token of set)
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  const limit = Math.max(
    8,
    Math.ceil(articles.length * options.maxDocumentFrequency),
  );
  const distinctive = tokens.map(
    (set) =>
      new Set(
        [...set].filter((token) => documentFrequency.get(token) <= limit),
      ),
  );

  const parent = articles.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const union = (a, b) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent[right] = left;
  };

  const publishers = articles.map(publisherOf);
  for (let i = 0; i < articles.length; i += 1) {
    for (let j = i + 1; j < articles.length; j += 1) {
      if (publishers[i] === publishers[j]) continue;
      let shared = 0;
      for (const token of distinctive[i])
        if (distinctive[j].has(token)) shared += 1;
      if (shared >= options.minSharedTokens) union(i, j);
    }
  }

  const groups = new Map();
  articles.forEach((article, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push({ article, tokens: distinctive[index] });
  });
  return [...groups.values()];
}

// Single-link components can chain unrelated stories through generic words
// ("sexta-feira", "ataque hacker"). Keep only members that contain a core
// term: one shared by a large share of the whole component.
function pruneToCore(members, options) {
  if (members.length < 3) return members;
  const counts = new Map();
  for (const { tokens } of members)
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  const needed = Math.max(3, Math.ceil(members.length * options.coreShare));
  const core = new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= needed)
      .map(([token]) => token),
  );
  if (!core.size) return [];
  return members.filter(({ tokens }) =>
    [...tokens].some((token) => core.has(token)),
  );
}

function clusterLabel(members) {
  const counts = new Map();
  for (const { tokens } of members)
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([token]) => token)
    .join(" ");
}

/**
 * Marks articles that belong to an event covered by many publishers across
 * desks. Mutates `article.breaking` in place so every later stage (including
 * the audit report) sees the same objects; returns the detected clusters.
 */
export function detectBreaking(articles, overrides = {}, now = new Date()) {
  const options = { ...DEFAULTS, ...overrides };
  const cutoff = now.getTime() - options.windowHours * 3600000;
  const recent = articles.filter(
    (article) => new Date(article.publishedAt || 0).getTime() >= cutoff,
  );
  if (recent.length < options.notablePublishers) return [];

  const detected = [];
  for (const component of cluster(recent, options)) {
    const members = pruneToCore(component, options);
    if (!members.length) continue;
    // Publishers that only appear as related coverage of a deduplicated item
    // still count as separate outlets covering the event.
    const names = new Set();
    for (const { article } of members) {
      names.add(publisherOf(article));
      for (const related of article.relatedCoverage || [])
        names.add(publisherOf(related));
    }
    names.delete("");
    const families = new Set(
      members.map(({ article }) => primaryFamily(article)).filter(Boolean),
    );
    const publisherCount = names.size;
    let level = null;
    if (
      (publisherCount >= options.majorPublishers && families.size >= 2) ||
      publisherCount >= options.singleDeskPublishers + 2
    )
      level = "major";
    else if (
      (publisherCount >= options.notablePublishers && families.size >= 2) ||
      publisherCount >= options.singleDeskPublishers
    )
      level = "notable";
    if (!level) continue;
    detected.push({
      members,
      publisherCount,
      families: [...families],
      level,
      label: clusterLabel(members),
    });
  }

  detected.sort(
    (a, b) =>
      Number(b.level === "major") - Number(a.level === "major") ||
      b.publisherCount - a.publisherCount ||
      b.families.length - a.families.length,
  );

  const clusters = [];
  for (const [index, item] of detected
    .slice(0, options.maxClusters)
    .entries()) {
    const id = `breaking-${index + 1}`;
    // One representative per publisher (the newest), so a newsroom that posted
    // five updates cannot consume the candidate budget.
    const byPublisher = new Map();
    for (const { article } of item.members) {
      const key = publisherOf(article);
      const current = byPublisher.get(key);
      if (
        !current ||
        new Date(article.publishedAt || 0) > new Date(current.publishedAt || 0)
      )
        byPublisher.set(key, article);
    }
    const representatives = new Set(
      [...byPublisher.values()]
        .sort(
          (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0),
        )
        .slice(0, options.maxRepresentatives),
    );
    for (const { article } of item.members) {
      article.breaking = {
        id,
        level: item.level,
        publishers: item.publisherCount,
        families: item.families,
        label: item.label,
        representative: representatives.has(article),
      };
      decision(article, "collect", "breaking-cluster", {
        cluster: id,
        level: item.level,
        publishers: item.publisherCount,
        families: item.families,
        label: item.label,
      });
    }
    clusters.push({
      id,
      level: item.level,
      publishers: item.publisherCount,
      families: item.families,
      label: item.label,
      articles: item.members.length,
    });
  }
  return clusters;
}
