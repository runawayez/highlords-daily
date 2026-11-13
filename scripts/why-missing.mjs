#!/usr/bin/env node
// Explains what happened to every story matching a term in an edition's
// editorial report: "why did story X not make the paper?"
//
//   npm run editorial:why -- outlook
//   npm run editorial:why -- "microsoft|apagão" --date 2026-11-13
//   npm run editorial:why -- --summary
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const [, value] = args.splice(index, 2);
  return value ?? null;
};
const summary = args.includes("--summary");
if (summary) args.splice(args.indexOf("--summary"), 1);
const outputDir = flag("--output") || "output";
const date =
  flag("--date") ||
  JSON.parse(fs.readFileSync(path.join(outputDir, "latest.json"), "utf8"))
    .editionDate;
const term = args.join(" ").trim();

if (!summary && !term) {
  console.error(
    'Uso: npm run editorial:why -- "<termo ou regex>" [--date AAAA-MM-DD] | --summary',
  );
  process.exit(2);
}

const file = path.join(outputDir, date, "editorial-report.json");
if (!fs.existsSync(file)) {
  console.error(`Relatório não encontrado: ${file}`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(file, "utf8"));
const decisions = report.decisions || [];

if (summary) {
  const counts = new Map();
  for (const item of decisions) {
    const key = `${item.stage} · ${item.reason}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  console.log(
    `Edição ${date}: ${report.selected?.length ?? 0} publicadas, ${decisions.length} decisões.\n`,
  );
  for (const [key, total] of [...counts].sort((a, b) => b[1] - a[1]))
    console.log(String(total).padStart(5), key);
  const balance = report.diversity;
  if (balance)
    console.log(
      `\nBalanço: meta ${balance.target}, publicadas ${balance.actual}, famílias ${balance.familyCount}, vagas não preenchidas ${balance.unfilled}.`,
    );
  process.exit(0);
}

let pattern;
try {
  pattern = new RegExp(term, "i");
} catch {
  pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

const byArticle = new Map();
for (const item of decisions) {
  if (!pattern.test(item.title || "")) continue;
  if (!byArticle.has(item.article))
    byArticle.set(item.article, {
      title: item.title,
      source: item.source,
      steps: [],
    });
  byArticle.get(item.article).steps.push(item);
}

if (!byArticle.size) {
  console.log(
    `Nenhuma matéria com "${term}" chegou ao relatório de ${date}. Ela pode não estar nos feeds, ter sido publicada fora da janela ou o feed pode ter falhado (veja output/status.json).`,
  );
  process.exit(0);
}

const published = new Set(
  (report.selected || []).map((item) => item.article || item.stableId),
);
for (const [id, entry] of byArticle) {
  const last = entry.steps.at(-1);
  const marker = published.has(id) ? "PUBLICADA" : "fora da edição";
  console.log(`\n[${marker}] ${entry.source} — ${entry.title}`);
  for (const step of entry.steps) {
    const extra = [
      step.category && `categoria=${step.category}`,
      step.score != null && `score=${step.score}`,
      step.cluster && `cluster=${step.cluster}`,
      step.level && `nível=${step.level}`,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `   ${step.stage} → ${step.reason}${extra ? `  (${extra})` : ""}`,
    );
  }
  if (!published.has(id))
    console.log(`   última etapa: ${last.stage} → ${last.reason}`);
}
