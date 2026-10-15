import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`${name} requires a value.`);
  return args[index + 1];
}

export async function loadDataset(args) {
  const dataset = JSON.parse(
    await fs.readFile(
      option(
        args,
        "--dataset",
        new URL("../tests/fixtures/editorial.json", import.meta.url),
      ),
      "utf8",
    ),
  );
  const feedbackFile = option(args, "--feedback");
  if (feedbackFile) {
    const feedback = JSON.parse(await fs.readFile(feedbackFile, "utf8"));
    if (feedback.version !== 1 || !Array.isArray(feedback.entries))
      throw new Error("Invalid feedback dataset.");
    for (const entry of feedback.entries) {
      if (entry.verdict !== "wrong-category" || !entry.expectedCategory)
        continue;
      const existing = dataset.articles.find(
        (article) => article.stableId === entry.key,
      );
      if (existing) existing.expectedCategory = entry.expectedCategory;
      else
        dataset.articles.push({
          id: Math.max(0, ...dataset.articles.map((article) => article.id)) + 1,
          stableId: entry.key,
          originalTitle: entry.originalTitle || entry.headline,
          excerpt: entry.excerpt || "",
          language: entry.language || "und",
          source: entry.source,
          link: entry.link,
          publishedAt: `${entry.date}T12:00:00Z`,
          imageMode: "off",
          focus: [],
          strictFocus: false,
          expectedCategory: entry.expectedCategory,
          referenceScore: 6,
        });
    }
  }
  return dataset;
}

export async function runEditorialFixture(
  dataset,
  { live = false, pdf = false, directory } = {},
) {
  // Use a dedicated CLI process: legacy adapters read config at import time.
  directory ||= await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-editorial-"),
  );
  Object.assign(process.env, {
    HIGHLORDS_PROFILE: "true",
    DATA_DIR: path.join(directory, "data"),
    OUTPUT_DIR: path.join(directory, "output"),
    CACHE_DIR: path.join(directory, "data", "cache"),
    MEMORY_FILE: path.join(directory, "data", "history.sqlite"),
    HISTORY_ENABLED: "false",
    AUTO_OPEN: "false",
    EXPORT_PDF: String(pdf),
    UNATTENDED: "true",
  });
  const [
    { createContext },
    { runPipeline },
    { createDailyServices },
    { loadPlugins },
    { fallbackNewsletter },
    { digest },
  ] = await Promise.all([
    import("../src/engine/context.mjs"),
    import("../src/engine/pipeline.mjs"),
    import("../src/daily.mjs"),
    import("../src/plugins.mjs"),
    import("../src/editorial/edition.mjs"),
    import("../src/utils/storage.mjs"),
  ]);
  const plugins = live ? await loadPlugins() : [];
  const context = createContext({ date: dataset.editionDate, force: true });
  // Expected labels/scores must never enter a model prompt.
  const articles = dataset.articles.map(
    ({ expectedCategory, referenceScore, expectedEligible, ...article }) => ({
      ...article,
    }),
  );
  const reference = new Map(
    dataset.articles.map((article) => [article.stableId, article]),
  );
  const services = createDailyServices(plugins);
  services.collect = async () => ({
    articles,
    errors: [],
    historyRejected: 0,
    imageRejected: 0,
  });
  if (!live) {
    services.preflight = async () => {};
    services.analyze = async (input) =>
      input.map((article) => ({
        ...article,
        category: reference.get(article.stableId).expectedCategory,
        score: reference.get(article.stableId).referenceScore,
        headline: article.originalTitle,
        summary: article.excerpt,
        topicKey: article.stableId,
        tags: [],
      }));
    services.rank = async (input) =>
      input.map((article) => ({
        ...article,
        sectionScore: article.score,
        frontPageScore: article.score,
      }));
    services.select = async (input, ctx) =>
      fallbackNewsletter(input, ctx.editionDate);
  }
  const result = await runPipeline(context, services);
  const ranked = JSON.parse(
    await fs.readFile(
      path.join(directory, "data", "runs", dataset.editionDate, "ranked.json"),
      "utf8",
    ),
  );
  return {
    directory,
    result,
    predictions: {
      articles: ranked,
      leadId: result.edition.lead?.stableId || result.edition.lead?.id,
    },
    benchmark: {
      kind: live ? "fixed-candidates-real-ollama" : "fixture-replay-no-model",
      note: "RSS/page discovery and image network I/O are excluded. Replay measures pipeline/render/export orchestration; only --live measures Ollama. Use --pdf for Chromium/PDF.",
      datasetDigest: digest(dataset),
      candidateCount: articles.length,
      model: live ? context.config.ollamaModel : null,
      editionStories: result.edition.stats.stories,
      pdfError: result.pdfError,
      metrics: context.metrics,
    },
  };
}
