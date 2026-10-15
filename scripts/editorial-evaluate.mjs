import fs from "node:fs/promises";
import path from "node:path";
import {
  loadDataset,
  option,
  runEditorialFixture,
} from "./editorial-fixture-run.mjs";
const args = process.argv.slice(2);
const dataset = await loadDataset(args);
const output = path.resolve(
  option(args, "--output", "data/evaluation/latest.json"),
);
let run;
try {
  let predictions = null;
  const file = option(args, "--predictions");
  if (file && args.includes("--live"))
    throw new Error("Choose --live or --predictions.");
  if (file) predictions = JSON.parse(await fs.readFile(file, "utf8"));
  if (args.includes("--live")) {
    run = await runEditorialFixture(dataset, { live: true });
    predictions = run.predictions;
  }
  const { evaluateEditorial } = await import("../src/editorial/evaluation.mjs");
  const report = evaluateEditorial(dataset, predictions);
  if (run) report.benchmark = run.benchmark;
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        ...report,
        checks: report.checks.filter((check) => !check.passed),
        benchmark: report.benchmark
          ? {
              kind: report.benchmark.kind,
              metrics: {
                stages: report.benchmark.metrics.stages,
                counters: report.benchmark.metrics.counters,
                totalMs: report.benchmark.metrics.totalMs,
              },
            }
          : undefined,
      },
      null,
      2,
    ),
  );
  console.log(`Report: ${output}`);
  if (!report.success) process.exitCode = 1;
} finally {
  if (run) await fs.rm(run.directory, { recursive: true, force: true });
}
