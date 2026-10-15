import { articleSimilarity } from "../services/memory.mjs";
import { materialDevelopment } from "./developments.mjs";
import { assessCopy } from "./provenance.mjs";

export function evaluateEditorial(dataset, predictions = null) {
  const checks = [];
  for (const pair of dataset.pairs || []) {
    const similarity = articleSimilarity(pair.candidate, pair.previous);
    const actual = materialDevelopment(
      pair.candidate,
      pair.previous,
      similarity,
    )
      ? "development"
      : similarity >= (pair.threshold || 0.72)
        ? "duplicate"
        : "different";
    checks.push({
      kind: "relation",
      id: pair.id,
      expected: pair.expected,
      actual,
      passed: actual === pair.expected,
    });
  }
  for (const sample of dataset.copies || []) {
    const actual = assessCopy(sample.article).status;
    checks.push({
      kind: "copy-consistency",
      id: sample.id,
      expected: sample.expected,
      actual,
      passed: actual === sample.expected,
    });
  }
  if (predictions) {
    const byId = new Map(
      (predictions.articles || []).map((article) => [
        String(article.stableId || article.id),
        article,
      ]),
    );
    for (const sample of dataset.articles || []) {
      const prediction = byId.get(String(sample.stableId || sample.id));
      if (!prediction && sample.expectedEligible === false) {
        checks.push({
          kind: "eligibility",
          id: sample.id,
          expected: "may-be-rejected",
          actual: "rejected",
          passed: true,
        });
        continue;
      }
      const actual = prediction?.category ?? null;
      checks.push({
        kind: "category",
        id: sample.id,
        expected: sample.expectedCategory,
        actual,
        passed: actual === sample.expectedCategory,
      });
      if (prediction) {
        const copy = assessCopy({
          ...sample,
          headline: prediction.headline,
          summary: prediction.summary,
        });
        checks.push({
          kind: "generated-copy-consistency",
          id: sample.id,
          expected: "no-numeric-conflict-detected",
          actual: copy.status,
          passed: copy.status === "no-numeric-conflict-detected",
        });
      }
    }
    if (dataset.leadCandidates?.length) {
      const actual = String(predictions.leadId ?? "");
      checks.push({
        kind: "lead",
        expected: dataset.leadCandidates,
        actual,
        passed: dataset.leadCandidates.map(String).includes(actual),
      });
    }
    for (const preference of dataset.rankingPreferences || []) {
      const higher = byId.get(String(preference.higher));
      const lower = byId.get(String(preference.lower));
      checks.push({
        kind: "ranking",
        expected: preference,
        passed: Boolean(
          higher &&
          ((lower &&
            Number(higher.frontPageScore ?? higher.score) >
              Number(lower.frontPageScore ?? lower.score)) ||
            (!lower &&
              dataset.articles.some(
                (sample) =>
                  String(sample.stableId || sample.id) ===
                    String(preference.lower) &&
                  sample.expectedEligible === false,
              ))),
        ),
      });
    }
  }
  const byKind = {};
  for (const check of checks) {
    const group = (byKind[check.kind] ||= { passed: 0, total: 0 });
    group.total++;
    if (check.passed) group.passed++;
  }
  return {
    datasetVersion: dataset.version,
    fixtureDate: dataset.editionDate,
    modelEvaluation: predictions
      ? "evaluated"
      : "not-run: use --live or --predictions",
    checks,
    byKind,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    success: checks.length > 0 && checks.every((check) => check.passed),
    note: "Synthetic starter cases. Passing is not evidence of broad editorial accuracy or factual verification. Review and expand the labels with real editions.",
  };
}
