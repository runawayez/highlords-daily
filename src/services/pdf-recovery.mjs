import path from "node:path";
import fs from "node:fs/promises";
import { atomicWrite, readJson } from "../utils/storage.mjs";
import { renderEditorialReport } from "../editorial/audit.mjs";

// Caller holds publication.lock and has already committed the recovered PDF.
export async function recordPdfRecovery(date, settings, publication, layout) {
  const directory = path.join(settings.outputDir, date);
  await fs.access(path.join(directory, `${publication.slug}-${date}.pdf`));
  const recoveredAt = new Date().toISOString();
  const runFile = path.join(settings.dataDir, "runs", date, "run.json");
  const run = await readJson(runFile);
  const previousPdfError = run?.pdfError;
  if (run?.status === "completed") {
    run.pdfError = null;
    if (run.error === previousPdfError) delete run.error;
    run.pdfRecoveredAt = recoveredAt;
    await atomicWrite(runFile, JSON.stringify(run, null, 2));
  }
  const editionFile = path.join(directory, "edition.json");
  const edition = await readJson(editionFile);
  if (edition) {
    edition.stats ||= {};
    if (layout) edition.stats.pdfLayout = layout;
    edition.stats.pdfRecoveredAt = recoveredAt;
    await atomicWrite(editionFile, JSON.stringify(edition, null, 2));
    const latestFile = path.join(settings.outputDir, "latest.json");
    if ((await readJson(latestFile))?.editionDate === date)
      await atomicWrite(latestFile, JSON.stringify(edition, null, 2));
  }
  for (const reportDirectory of [directory, path.dirname(runFile)]) {
    const file = path.join(reportDirectory, "editorial-report.json");
    const report = await readJson(file);
    if (!report || report.editionDate !== date) continue;
    if (report.status === "completed-pdf-pending") {
      report.status = "completed";
      report.error = null;
    }
    report.pdfRecoveredAt = recoveredAt;
    if (layout) report.pdfLayout = layout;
    await atomicWrite(file, JSON.stringify(report, null, 2));
    await atomicWrite(
      path.join(reportDirectory, "editorial-report.html"),
      renderEditorialReport(report),
    );
  }
  const statusFile = path.join(settings.outputDir, "status.json");
  const status = await readJson(statusFile);
  if (status?.editionDate === date && status.status === "pdf-pending")
    await atomicWrite(
      statusFile,
      JSON.stringify(
        { ...status, status: "completed", error: null, updatedAt: recoveredAt },
        null,
        2,
      ),
    );
}
