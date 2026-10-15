import fs from "node:fs/promises";
import path from "node:path";
import {
  loadDataset,
  option,
  runEditorialFixture,
} from "./editorial-fixture-run.mjs";
const args = process.argv.slice(2);
const dataset = await loadDataset(args);
const target = path.resolve(
  option(args, "--output", "data/benchmarks/latest.json"),
);
const artifacts = option(args, "--artifacts");
let run;
try {
  run = await runEditorialFixture(dataset, {
    live: args.includes("--live"),
    pdf: args.includes("--pdf"),
    directory: artifacts ? path.resolve(artifacts) : undefined,
  });
  const { evaluateEditorial } = await import("../src/editorial/evaluation.mjs");
  const report = {
    ...run.benchmark,
    evaluation: evaluateEditorial(
      dataset,
      args.includes("--live") ? run.predictions : null,
    ),
  };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(report, null, 2));
  const { decisions, ...metrics } = report.metrics;
  console.log(
    JSON.stringify(
      {
        ...report,
        metrics,
        evaluation: {
          ...report.evaluation,
          checks: report.evaluation.checks.filter((check) => !check.passed),
        },
      },
      null,
      2,
    ),
  );
  console.log(`Report: ${target}`);
  if (!report.evaluation.success || run.result.pdfError) process.exitCode = 1;
} finally {
  if (run && !artifacts)
    await fs.rm(run.directory, { recursive: true, force: true });
}
