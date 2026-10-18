import { decision as recordDecision } from "../src/editorial/audit.mjs";
import { categories, config, publication } from "../src/config.mjs";
import { itemsSchema } from "../src/services/ollama-client.mjs";
import { requestItemReview } from "../src/services/editorial-review.mjs";

const validSlugs = new Set(categories.map((category) => category.slug));
const taxonomy = categories
  .map(
    (category) =>
      `- ${category.slug}: ${category.name} — ${category.description}`,
  )
  .join("\n");

const MISMATCH_CONFIDENCE = 0.7;
const REJECT_CONFIDENCE = 0.78;

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeDecision(row) {
  const id = Number(row?.id);
  return {
    id: Number.isFinite(id) ? id : null,
    category: validSlugs.has(row?.category) ? row.category : null,
    confidence: clampConfidence(row?.confidence),
  };
}

export function applyStrictFocusAudit(articles, rows = []) {
  const decisions = new Map();
  for (const row of rows) {
    const decision = normalizeDecision(row);
    if (decision.id == null || decisions.has(decision.id)) continue;
    decisions.set(decision.id, decision);
  }

  const output = [];
  const stats = { checked: 0, kept: 0, rejected: 0, uncertain: 0 };

  for (const article of articles || []) {
    const focus = Array.isArray(article?.focus) ? article.focus : [];
    if (!article?.strictFocus || !focus.length) {
      output.push(article);
      continue;
    }

    stats.checked += 1;
    const decision = decisions.get(Number(article.id));
    if (decision)
      recordDecision(article, "strict-focus-audit", "model-decision", {
        suggestedCategory: decision.category,
        confidence: decision.confidence,
      });
    if (!decision) {
      stats.uncertain += 1;
      output.push(article);
      continue;
    }

    if (decision.category == null) {
      if (decision.confidence >= REJECT_CONFIDENCE) {
        stats.rejected += 1;
        continue;
      }
      stats.uncertain += 1;
      output.push(article);
      continue;
    }

    if (!focus.includes(decision.category)) {
      if (decision.confidence >= MISMATCH_CONFIDENCE) {
        stats.rejected += 1;
        continue;
      }
      stats.uncertain += 1;
      output.push(article);
      continue;
    }

    stats.kept += 1;
    output.push({
      ...article,
      strictFocusAudit: "matched",
      strictFocusAuditCategory: decision.category,
      strictFocusAuditConfidence: decision.confidence,
    });
  }

  return { articles: output, stats };
}

function auditPayload(batch) {
  return batch.map((article) => ({
    id: Number(article.id),
    title: article.originalTitle,
    excerpt: article.excerpt,
  }));
}

function auditSchema(batch) {
  return itemsSchema({
    id: {
      type: "integer",
      enum: batch.map((article) => Number(article.id)),
    },
    category: {
      type: ["string", "null"],
      enum: [...categories.map((category) => category.slug), null],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  });
}

const auditSystem = `You are an independent content-category auditor for ${publication.name}.
Classify each story by the MEANING of its title and excerpt only.

Configured taxonomy:
${taxonomy}

Rules:
- Ignore the publisher, feed name, URL section and any presumed source specialization.
- You are deliberately NOT told the source focus. Do not infer a category from where a story was published.
- Choose the single best semantic category from the configured taxonomy.
- Use category=null only when the story does not meaningfully fit any configured category.
- A football story is Sports even if it came from a politics feed.
- A reality-show story is Entertainment even if it came from a sports feed.
- A political protest, election, government or rights story is Politics & Society even if it came from a sports or entertainment feed.
- confidence is 0..1 and reflects certainty in the semantic category.
- Return exactly one row for every supplied id and only valid JSON.`;

async function auditBatch(batch) {
  return requestItemReview(auditSystem, auditPayload(batch), {
    namespace: "strict-focus-review",
    schema: auditSchema(batch),
  });
}

async function afterAnalyze(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  const strict = input.filter(
    (article) =>
      article?.strictFocus &&
      Array.isArray(article.focus) &&
      article.focus.length > 0,
  );
  if (!strict.length) return payload;

  const decisions = [];
  const batchSize = Math.max(8, Math.min(24, config.aiBatchSize * 2));
  for (let offset = 0; offset < strict.length; offset += batchSize) {
    const batch = strict.slice(offset, offset + batchSize);
    try {
      decisions.push(...(await auditBatch(batch)));
    } catch (error) {
      console.warn(
        `  Strict-focus content audit batch skipped: ${error.message || error}`,
      );
    }
  }

  const result = applyStrictFocusAudit(input, decisions);
  console.log(
    `  Strict-focus audit: ${result.stats.checked} verificada(s) · ${result.stats.kept} compatível(is) · ${result.stats.rejected} rejeitada(s) por conteúdo fora do foco${result.stats.uncertain ? ` · ${result.stats.uncertain} inconclusiva(s)` : ""}.`,
  );

  return {
    ...payload,
    articles: result.articles,
    strictFocusAudit: result.stats,
  };
}

export default {
  name: "Strict Focus Content Audit",
  afterAnalyze,
};
