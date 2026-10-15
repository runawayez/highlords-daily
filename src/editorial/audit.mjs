import { currentMetrics } from "../engine/metrics.mjs";
import { escapeHtml } from "../utils/html.mjs";

export function articleKey(article = {}) {
  return String(article.stableId || article.link || article.id || "unknown");
}

export function decision(article, stage, reason, details = {}) {
  const metrics = currentMetrics();
  if (!metrics) return;
  (metrics.decisions ||= []).push({
    article: articleKey(article),
    title: article.originalTitle || article.headline || "",
    source: article.source || "",
    stage,
    reason,
    ...details,
  });
}

export function auditTransition(before, after, stage, removedReason) {
  const remaining = new Map(
    after.map((article) => [articleKey(article), article]),
  );
  for (const article of before) {
    const next = remaining.get(articleKey(article));
    decision(
      article,
      stage,
      next ? "retained" : removedReason,
      next
        ? {
            categoryBefore: article.category || null,
            category: next.category || null,
            score: next.score ?? null,
            sectionScore: next.sectionScore ?? null,
            frontPageScore: next.frontPageScore ?? null,
            review: next.semanticReviewReason || null,
            provenance: next.provenance?.status || null,
          }
        : {},
    );
  }
}

export function editionStories(edition = {}) {
  edition ||= {};
  return [
    ...new Map(
      [
        edition.lead,
        ...(edition.topStories || []),
        ...(edition.sections || []).flatMap(
          (section) => section.articles || [],
        ),
      ]
        .filter(Boolean)
        .map((article) => [articleKey(article), article]),
    ).values(),
  ];
}

export function editorialReport(
  context,
  edition,
  status = "completed",
  error = null,
) {
  const selected = new Set(editionStories(edition).map(articleKey));
  return {
    version: 1,
    editionDate: context.editionDate,
    status,
    error,
    generatedAt: new Date().toISOString(),
    metrics: context.metrics
      ? {
          stages: context.metrics.stages,
          counters: context.metrics.counters,
          totalMs: context.metrics.totalMs,
          peakRssBytes: context.metrics.peakRssBytes,
        }
      : {},
    selected: [...selected],
    decisions: context.metrics?.decisions || [],
    caveat:
      "A score or matching number is not a fact check. Omission reasons describe the observed stage, not an inferred editorial motive.",
  };
}

export function renderEditorialReport(report) {
  const rows = report.decisions
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.source)}</td><td>${escapeHtml(item.stage)}</td><td>${escapeHtml(item.reason)}</td><td><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Editorial report — ${escapeHtml(report.editionDate)}</title><style>body{font:14px system-ui;margin:24px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;max-width:480px}input{padding:10px;width:min(90%,600px);margin:16px 0}</style><h1>Editorial report — ${escapeHtml(report.editionDate)}</h1><p>${escapeHtml(report.status)} ${escapeHtml(report.error || "")}</p><p>${escapeHtml(report.caveat)}</p><label>Filter <input id="filter" type="search"></label><table><thead><tr><th>Story</th><th>Source</th><th>Stage</th><th>Decision</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table><script>document.querySelector('#filter').addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase();document.querySelectorAll('tbody tr').forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase().includes(q))});</script></html>`;
}
