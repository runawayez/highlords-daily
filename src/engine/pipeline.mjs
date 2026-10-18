import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../utils/storage.mjs";
import { RunState, acquireLock } from "./run-state.mjs";
import { measure, withMetrics } from "./metrics.mjs";
import { deliverEdition } from "../services/delivery.mjs";
import {
  auditTransition,
  decision,
  editionStories,
  editorialReport,
  renderEditorialReport,
} from "../editorial/audit.mjs";

async function saveReport(directory, report) {
  await atomicWrite(
    path.join(directory, "editorial-report.json"),
    JSON.stringify(report, null, 2),
  );
  await atomicWrite(
    path.join(directory, "editorial-report.html"),
    renderEditorialReport(report),
  );
}

export async function runPipeline(context, services) {
  const {
    config,
    publication,
    editionDate: date,
    fingerprint,
    options,
  } = context;
  // One publication lock protects history, latest pointers and all dates, not just this run.
  const release = await acquireLock(
    path.join(config.dataDir, "publication.lock"),
  );
  const runDirectory = path.join(config.dataDir, "runs", date);
  let state;
  try {
    state = await new RunState(runDirectory, fingerprint, options).init();
  } catch (error) {
    await release();
    throw error;
  }
  let result;
  const previouslyCompleted = state.state.status === "completed";
  try {
    result = await withMetrics(async (metrics) => {
      context.metrics = metrics;
      if (state.state.status === "completed" && !options.force) {
        const editionDir = path.join(config.outputDir, date);
        const edition = JSON.parse(
          await fs.readFile(path.join(editionDir, "edition.json"), "utf8"),
        );
        if (options.deliver)
          await measure("delivery", () => deliverEdition(edition, editionDir));
        return {
          edition,
          editionDir,
          alreadyCompleted: true,
          pdfError: state.state.pdfError,
        };
      }
      await services.preflight(context);
      const collected = await measure("collect", () =>
        state.stage("collected", () => services.collect(context)),
      );
      if (!collected.articles?.length)
        throw new Error("No new eligible articles remain.");
      const analyzed = await measure("analysis", () =>
        state.stage("analyzed", () =>
          services.analyze(collected.articles, context),
        ),
      );
      auditTransition(
        collected.articles,
        analyzed,
        "analysis-result",
        "not-approved-by-analysis",
      );
      if (!analyzed.length) throw new Error("No valid analyzed candidates.");
      const ranked = await measure("ranking", () =>
        state.stage("ranked", () => services.rank(analyzed, context)),
      );
      auditTransition(
        analyzed,
        ranked,
        "ranking-result",
        "removed-during-editorial-review",
      );
      context.reserveCandidates = ranked;
      const selected = await measure("curation", () =>
        state.stage("selected", () => services.select(ranked, context)),
      );
      auditTransition(
        ranked,
        editionStories(selected),
        "selection",
        "not-selected-by-curator-or-edition-rules",
      );
      selected.stats = {
        ...selected.stats,
        historyRejected: collected.historyRejected || 0,
        imageRejected: collected.imageRejected || 0,
        feedErrors: collected.errors || [],
      };
      // Keep staging/backup on the output filesystem, even when dataDir is on another disk.
      const stagingRoot = path.join(config.outputDir, ".staging", date);
      const staging = path.join(stagingRoot, "edition");
      await fs.rm(staging, { recursive: true, force: true });
      await fs.mkdir(staging, { recursive: true });
      const edition = await measure("images", () =>
        services.images(selected, staging, context),
      );
      auditTransition(
        editionStories(selected),
        editionStories(edition),
        "final-images-and-presentation",
        "replaced-or-removed-before-render",
      );
      for (const story of editionStories(edition))
        decision(story, "publication", "selected", {
          category: story.category,
          score: story.score,
          sectionScore: story.sectionScore,
          frontPageScore: story.frontPageScore,
          rankingSignals: story.rankingSignals,
          coverageEvidence: story.coverageEvidence,
          development: story.development,
          provenance: story.provenance,
        });
      const html = await measure("html", () => services.html(edition, context));
      await atomicWrite(path.join(staging, "index.html"), html);
      await atomicWrite(
        path.join(staging, "edition.json"),
        JSON.stringify(edition, null, 2),
      );
      await measure("exports", () =>
        services.exports(edition, staging, context),
      );
      let pdfError = null;
      if (config.exportPdf) {
        try {
          const pdf = await measure("pdf", () =>
            services.pdf(html, {
              baseDir: staging,
              onLayout: (layout) => {
                edition.stats.pdfLayout = layout;
              },
            }),
          );
          await atomicWrite(
            path.join(staging, `${publication.slug}-${date}.pdf`),
            pdf,
          );
        } catch (error) {
          pdfError = error.message;
          metrics.counters.pdfFailures = 1;
          console.warn(`PDF failed; HTML/JSON preserved: ${pdfError}`);
        }
      }
      await atomicWrite(
        path.join(staging, "edition.json"),
        JSON.stringify(edition, null, 2),
      );
      await saveReport(
        staging,
        editorialReport(
          context,
          edition,
          pdfError ? "completed-pdf-pending" : "completed",
          pdfError,
        ),
      );
      await fs.mkdir(config.outputDir, { recursive: true });
      const finalDirectory = path.join(config.outputDir, date);
      const backup = path.join(stagingRoot, "previous-edition");
      // Never expose partial HTML/assets: stage a complete edition, then swap directories.
      await fs.rm(backup, { recursive: true, force: true });
      try {
        await fs.rename(finalDirectory, backup);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      try {
        await fs.rename(staging, finalDirectory);
      } catch (error) {
        await fs.rename(backup, finalDirectory).catch(() => {});
        throw error;
      }
      await measure("publish", () =>
        services.publish(edition, finalDirectory, context),
      );
      await measure("history", () => services.remember(edition));
      await services.afterWrite(edition, finalDirectory, context);
      state.state.status = "completed";
      state.state.pdfError = pdfError;
      state.state.completedAt = new Date().toISOString();
      await state.save();
      await fs.rm(backup, { recursive: true, force: true });
      await services.status?.(
        {
          status: pdfError ? "pdf-pending" : "completed",
          editionDate: date,
          error: pdfError,
          updatedAt: new Date().toISOString(),
        },
        context,
      );
      if (options.deliver)
        await measure("delivery", () =>
          deliverEdition(edition, finalDirectory),
        );
      return { edition, editionDir: finalDirectory, pdfError };
    });
    return result;
  } catch (error) {
    // Delivery errors do not turn an already committed edition into a generation failure.
    if (state.state.status !== "completed") state.state.status = "failed";
    state.state.error = error.message;
    await state.save();
    try {
      await saveReport(
        runDirectory,
        editorialReport(context, null, state.state.status, error.message),
      );
      await services.status?.(
        {
          status:
            state.state.status === "completed"
              ? "delivery-or-postpublish-failed"
              : "failed",
          editionDate: date,
          error: error.message,
          updatedAt: new Date().toISOString(),
        },
        context,
      );
      console.warn(
        `Generation/operation failed for ${date}: ${error.message}. See ${path.join(runDirectory, "editorial-report.html")}. The last valid edition keeps its original date.`,
      );
    } catch (reportError) {
      console.warn(`Could not save failure report: ${reportError.message}`);
    }
    throw error;
  } finally {
    try {
      if (result?.edition && !result.alreadyCompleted) {
        await saveReport(
          result.editionDir,
          editorialReport(
            context,
            result.edition,
            result.pdfError ? "completed-pdf-pending" : "completed",
            result.pdfError,
          ),
        );
      }
      if (context.metrics)
        await atomicWrite(
          path.join(
            runDirectory,
            previouslyCompleted && !options.force
              ? "last-check.json"
              : "metrics.json",
          ),
          JSON.stringify(context.metrics, null, 2),
        );
    } finally {
      await release();
    }
  }
}
