import { normalizeText } from "../utils/text.mjs";

// Conservative source-text signals, not model-generated claims. Unsupported
// languages/ambiguous changes keep the existing duplicate policy.
const stages = [
  [
    "blocked",
    /\b(block(?:s|ed)?|bloque(?:ia|ou|ado|ada)|vet(?:a|ou|ado)|proib(?:e|iu|ido)|rechaz(?:a|ado)|blocked|banned)\b/iu,
  ],
  [
    "approved",
    /\b(approv(?:e[sd]?|al)|aprov(?:a|ou|ado|ada)|autoriz(?:a|ou|ado)|aprob(?:ado|ada))\b/iu,
  ],
  [
    "cancelled",
    /\b(cancel(?:s|led|ed)?|cancel(?:a|ou|ado|ada)|abandon(?:s|ed|a|ou))\b/iu,
  ],
  [
    "completed",
    /\b(complet(?:es|ed)|conclu(?:i|iu|ida|ido)|finaliz(?:a|ou|ada)|closed)\b/iu,
  ],
  [
    "announced",
    /\b(announc(?:e[sd]?|ement)|anunci(?:a|ou|ado|ada)|anuncia(?:do|da)?|propos(?:es|ed|ta|to)|planej(?:a|ou))\b/iu,
  ],
];

export function sourceEvent(article = {}) {
  const title = String(article.originalTitle || article.title || "");
  // A title is more specific than a snippet that may recap previous events.
  for (const text of [title, String(article.excerpt || "")]) {
    const matches = stages.filter(([, pattern]) => pattern.test(text));
    if (matches.length === 1)
      return { stage: matches[0][0], evidence: text.slice(0, 1400) };
    if (matches.length > 1) return null;
  }
  return null;
}

export function materialDevelopment(candidate, previous, similarity) {
  if (similarity < 0.45) return null;
  const before = sourceEvent(previous);
  const after = sourceEvent(candidate);
  const newer =
    Date.parse(candidate.publishedAt) > Date.parse(previous.publishedAt);
  if (!before || !after || before.stage === after.stage || !newer) return null;
  // Do not treat a newly syndicated announcement as a development of a block.
  if (after.stage === "announced") return null;
  if (normalizeText(before.evidence) === normalizeText(after.evidence))
    return null;
  return {
    previousLink: previous.link || null,
    previousEdition: previous.editionDate || null,
    previousStage: before.stage,
    stage: after.stage,
    evidence: after.evidence,
  };
}
