import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../utils/storage.mjs";
import { RunState, acquireLock } from "./run-state.mjs";
import { measure, withMetrics } from "./metrics.mjs";
import { deliverEdition } from "../services/delivery.mjs";
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
      if (!analyzed.length) throw new Error("No valid analyzed candidates.");
      const ranked = await measure("ranking", () =>
        state.stage("ranked", () => services.rank(analyzed, context)),
      );
      context.reserveCandidates = ranked;
      const selected = await measure("curation", () =>
        state.stage("selected", () => services.select(ranked, context)),
      );
      selected.stats = {
        ...selected.stats,
        historyRejected: collected.historyRejected || 0,
        imageRejected: collected.imageRejected || 0,
        feedErrors: collected.errors || [],
      };
      const staging = path.join(runDirectory, "edition");
      await fs.mkdir(staging, { recursive: true });
      const edition = await measure("images", () =>
        services.images(selected, staging, context),
      );
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
            services.pdf(html, { baseDir: staging }),
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
      await fs.mkdir(config.outputDir, { recursive: true });
      const finalDirectory = path.join(config.outputDir, date);
      const backup = path.join(runDirectory, "previous-edition");
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
    throw error;
  } finally {
    try {
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
