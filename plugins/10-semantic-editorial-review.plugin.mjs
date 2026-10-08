import { categories, config, profile, publication } from "../src/config.mjs";
import { itemsSchema, requestChat } from "../src/services/ollama-client.mjs";

const validSlugs = new Set(categories.map((category) => category.slug));
const taxonomy = categories
  .map(
    (category) =>
      `- ${category.slug}: ${category.name} — ${category.description}`,
  )
  .join("\n");

const RECLASSIFY_CONFIDENCE = 0.68;
const REJECT_CONFIDENCE = 0.74;

function normalizeId(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeReason(value) {
  return typeof value === "string" ? value.trim().slice(0, 280) : "";
}

function normalizeDecision(row) {
  const id = normalizeId(row?.id);
  const action = ["keep", "reclassify", "reject"].includes(row?.action)
    ? row.action
    : "keep";
  const category = validSlugs.has(row?.category) ? row.category : null;
  return {
    id,
    action,
    category,
    confidence: normalizeConfidence(row?.confidence),
    reason: normalizeReason(row?.reason),
  };
}

function allowedByStrictFocus(article, category) {
  if (!article?.strictFocus) return true;
  const focus = Array.isArray(article.focus) ? article.focus : [];
  return focus.length === 0 || focus.includes(category);
}

export function applySemanticReview(articles, rows = []) {
  const decisions = new Map();
  for (const row of rows) {
    const decision = normalizeDecision(row);
    if (decision.id == null || decisions.has(decision.id)) continue;
    decisions.set(decision.id, decision);
  }

  const output = [];
  const stats = { kept: 0, reclassified: 0, rejected: 0, ignored: 0 };

  for (const article of articles || []) {
    const decision = decisions.get(Number(article.id));
    if (!decision) {
      stats.kept += 1;
      output.push(article);
      continue;
    }

    if (
      decision.action === "reject" &&
      decision.confidence >= REJECT_CONFIDENCE
    ) {
      stats.rejected += 1;
      continue;
    }

    if (
      decision.action === "reclassify" &&
      decision.category &&
      decision.category !== article.category &&
      decision.confidence >= RECLASSIFY_CONFIDENCE
    ) {
      if (!allowedByStrictFocus(article, decision.category)) {
        stats.rejected += 1;
        continue;
      }
      stats.reclassified += 1;
      output.push({
        ...article,
        category: decision.category,
        semanticReview: "reclassified",
        semanticReviewConfidence: decision.confidence,
        semanticReviewReason: decision.reason,
      });
      continue;
    }

    stats.kept += 1;
    if (decision.action !== "keep") stats.ignored += 1;
    output.push({
      ...article,
      semanticReview: "kept",
      semanticReviewConfidence: decision.confidence,
      semanticReviewReason: decision.reason,
    });
  }

  return { articles: output, stats };
}

function reviewPayload(batch) {
  return batch.map((article) => ({
    id: Number(article.id),
    sourceLanguage: article.language || "und",
    source: article.source,
    title: article.originalTitle,
    excerpt: article.excerpt,
    currentCategory: article.category,
    score: article.score,
    focus: Array.isArray(article.focus) ? article.focus : [],
    strictFocus: Boolean(article.strictFocus),
  }));
}

function reviewSchema(batch) {
  return itemsSchema({
    id: {
      type: "integer",
      enum: batch.map((article) => Number(article.id)),
    },
    action: { type: "string", enum: ["keep", "reclassify", "reject"] },
    category: {
      type: ["string", "null"],
      enum: [...categories.map((category) => category.slug), null],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
  });
}

const reviewSystem = `You are the senior editorial reviewer for ${publication.name}.
Your job is to audit category assignments semantically, independent of the source language.
Read the meaning of each story. Do not classify by isolated keywords, spelling, accents, country-specific vocabulary, or language-specific regex rules.

Configured taxonomy (the only valid editorial categories):
${taxonomy}

Editorial profile:
- name: ${profile.name}
- goal: ${profile.description}
- tone: ${profile.tone}
- output locale: ${config.language}
- editorial context: ${config.editorialContext}

For EVERY supplied item return exactly one review row.
- action=keep when currentCategory is semantically correct.
- action=reclassify only when another configured category is clearly a better semantic fit.
- action=reject when the story does not meaningfully fit ANY configured category or is clearly outside the publication scope.
- category must be the resulting category for keep/reclassify; use null for reject.
- focus is a source hint, not a keyword rule.
- if strictFocus=true, the resulting category MUST be inside focus. If the story does not fit any allowed category, reject it.
- confidence is 0..1 and should reflect certainty in the audit decision.
- reason must be short and factual.
- do not invent facts and do not reward clickbait.

Return only valid JSON.`;

async function reviewBatch(batch) {
  const parsed = await requestChat(reviewSystem, JSON.stringify(reviewPayload(batch)), {
    timeoutMs: 150000,
    schema: reviewSchema(batch),
  });
  return Array.isArray(parsed?.items) ? parsed.items : [];
}

async function afterAnalyze(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  if (!input.length) return payload;

  const batchSize = Math.max(8, Math.min(24, config.aiBatchSize * 2));
  const reviewed = [];
  const totals = { kept: 0, reclassified: 0, rejected: 0, ignored: 0 };

  for (let offset = 0; offset < input.length; offset += batchSize) {
    const batch = input.slice(offset, offset + batchSize);
    try {
      const result = applySemanticReview(batch, await reviewBatch(batch));
      reviewed.push(...result.articles);
      for (const key of Object.keys(totals)) totals[key] += result.stats[key] || 0;
    } catch (error) {
      console.warn(
        `  Semantic review batch kept unchanged: ${error.message || error}`,
      );
      reviewed.push(...batch);
      totals.kept += batch.length;
    }
  }

  console.log(
    `  Semantic review: ${totals.kept} mantida(s) · ${totals.reclassified} reclassificada(s) · ${totals.rejected} rejeitada(s)${totals.ignored ? ` · ${totals.ignored} mudança(s) de baixa confiança ignorada(s)` : ""}.`,
  );

  return { ...payload, articles: reviewed, semanticReview: totals };
}

export default {
  name: "Semantic Editorial Review",
  afterAnalyze,
};
