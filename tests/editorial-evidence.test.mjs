import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluateEditorial } from "../src/editorial/evaluation.mjs";
import { enforceCopyProvenance } from "../src/editorial/provenance.mjs";
import { coverageEvidence } from "../src/editorial/coverage.mjs";
import { withMetrics } from "../src/engine/metrics.mjs";
import { RunState } from "../src/engine/run-state.mjs";
import {
  decision,
  editorialReport,
  renderEditorialReport,
} from "../src/editorial/audit.mjs";
import { validateFeedback, importFeedback } from "../src/services/feedback.mjs";
import { config } from "../src/config.mjs";
import {
  filterPreviouslyPublished,
  rememberEdition,
  recentPublishedStories,
  closeMemory,
} from "../src/services/memory.mjs";

const dataset = JSON.parse(
  await fs.readFile(
    new URL("./fixtures/editorial.json", import.meta.url),
    "utf8",
  ),
);

test("editorial starter set checks duplicates/developments and numeric fidelity without claiming model accuracy", () => {
  const report = evaluateEditorial(dataset);
  assert.equal(report.success, true);
  assert.equal(report.total, 12);
  assert.match(report.modelEvaluation, /not-run/);
  assert.equal(evaluateEditorial(dataset, { articles: [] }).success, false);
  const predictions = {
    articles: dataset.articles.map((article) => ({
      ...article,
      category: article.expectedCategory,
      headline: article.originalTitle,
      summary: article.excerpt,
      frontPageScore: article.referenceScore,
    })),
    leadId: "fixture-4",
  };
  assert.equal(evaluateEditorial(dataset, predictions).success, true);
  predictions.articles[0].category = "games";
  predictions.leadId = "fixture-11";
  assert.equal(evaluateEditorial(dataset, predictions).success, false);
});

test("copy provenance retains evidence and replaces unsupported translated prices with source copy", () => {
  const source = {
    link: "https://example.org/story",
    language: "en",
    originalTitle: "Product costs $5",
    excerpt: "The product was announced at $5.",
    headline: "Produto custa R$25",
    summary: "O preço é R$25.",
  };
  const result = enforceCopyProvenance(source, "pt-BR");
  assert.equal(result.headline, source.originalTitle);
  assert.equal(result.provenance.action, "source-fallback");
  assert.equal(result.provenance.languageFallback, true);
  assert.equal(result.provenance.source.link, source.link);
  assert.ok(result.provenance.originalIssues.includes("r$25"));
  const localized = {
    ...source,
    headline: "Produto custa $5",
    summary: "O preço anunciado é $5.",
  };
  assert.equal(
    enforceCopyProvenance(localized, "pt-BR").headline,
    localized.headline,
  );
});

test("coverage counts publishers separately from declared reporting origins", () => {
  const excerpt =
    "A empresa anunciou uma mudança em seus serviços, conforme comunicado distribuído aos veículos de imprensa.";
  const sources = ["A", "B", "C"].map((source) => ({
    source,
    publisherGroup: source,
    excerpt,
  }));
  const unknown = coverageEvidence(sources);
  assert.equal(unknown.coverageCount, 3);
  assert.equal(unknown.independentCoverageCount, 1);
  assert.equal(unknown.coverageEvidence.repeatedExcerpts, true);
  assert.equal(
    coverageEvidence(
      sources.map((article) => ({ ...article, reportingOrigin: "Agency" })),
    ).independentCoverageCount,
    1,
  );
  assert.equal(
    coverageEvidence([
      { source: "A", reportingOrigin: "Agency" },
      { source: "B", reportingOrigin: "Independent Desk" },
    ]).independentCoverageCount,
    2,
  );
});

test("checkpoints replay editorial decisions and escaped reports survive a failed edition", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-audit-"),
  );
  try {
    const run = await new RunState(directory, "audit").init();
    await withMetrics(async () =>
      run.stage("collected", async () => {
        decision(
          { id: "a", originalTitle: "<script>bad</script>" },
          "collect",
          "candidate-selected",
        );
        return { articles: [{ id: "a" }] };
      }),
    );
    await withMetrics(async (metrics) => {
      const resumed = await new RunState(directory, "audit").init();
      await resumed.stage("collected", () =>
        assert.fail("must reuse checkpoint"),
      );
      const report = editorialReport(
        { editionDate: "2026-10-15", metrics },
        null,
        "failed",
        "Missing category",
      );
      assert.equal(report.decisions.length, 1);
      assert.equal(report.selected.length, 0);
      assert.ok(renderEditorialReport(report).includes("&lt;script&gt;bad"));
      assert.ok(!renderEditorialReport(report).includes("<script>bad"));
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("feedback import validates publication/corrections and merges edits without duplicate entries", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-feedback-"),
  );
  const document = {
    version: 1,
    publication: "daily",
    entries: [
      {
        key: "a",
        date: "2026-10-15",
        verdict: "wrong-category",
        expectedCategory: "games",
        link: "javascript:alert(1)",
      },
    ],
  };
  try {
    assert.throws(() => validateFeedback(document, "other"), /publication/);
    assert.throws(
      () =>
        validateFeedback(
          {
            ...document,
            entries: [{ ...document.entries[0], expectedCategory: "" }],
          },
          "daily",
        ),
      /corrected category/,
    );
    await importFeedback(document, {
      publication: "daily",
      dataDir: directory,
    });
    document.entries[0].expectedCategory = "esports";
    const result = await importFeedback(document, {
      publication: "daily",
      dataDir: directory,
    });
    assert.equal(result.total, 1);
    const saved = JSON.parse(await fs.readFile(result.file, "utf8"));
    assert.equal(saved.entries[0].expectedCategory, "esports");
    assert.equal(saved.entries[0].link, "#");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("legacy SQLite history migrates without loss and allows a sourced material update on the same URL", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-history-"),
  );
  const oldConfig = {
    memoryFile: config.memoryFile,
    historyEnabled: config.historyEnabled,
  };
  config.memoryFile = path.join(directory, "history.sqlite");
  config.historyEnabled = true;
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const today = new Date().toISOString();
  const previous = {
    originalTitle: "Empresa anuncia aquisição da Rival",
    link: "https://example.org/acquisition",
    topicKey: "empresa-rival",
    publishedAt: yesterday,
    category: "economia",
    source: "Example",
  };
  const db = new DatabaseSync(config.memoryFile);
  db.exec(
    "CREATE TABLE published_stories (id INTEGER PRIMARY KEY AUTOINCREMENT, edition_date TEXT NOT NULL, link TEXT NOT NULL, source TEXT, original_title TEXT, headline TEXT, category TEXT, topic_key TEXT, fingerprint TEXT, published_at TEXT, created_at TEXT NOT NULL); CREATE UNIQUE INDEX idx_published_link ON published_stories(link)",
  );
  db.prepare(
    "INSERT INTO published_stories (edition_date,link,original_title,topic_key,published_at,created_at) VALUES (?,?,?,?,?,?)",
  ).run(
    yesterday.slice(0, 10),
    previous.link,
    previous.originalTitle,
    previous.topicKey,
    yesterday,
    yesterday,
  );
  db.close();
  try {
    assert.equal((await recentPublishedStories()).length, 1);
    const candidate = {
      ...previous,
      originalTitle: "Regulador bloqueia aquisição da Rival pela Empresa",
      publishedAt: today,
      excerpt: "O regulador bloqueou a operação por motivos concorrenciais.",
    };
    const filtered = await filterPreviouslyPublished([candidate]);
    assert.equal(filtered.articles.length, 1);
    assert.equal(filtered.articles[0].development.stage, "blocked");
    await rememberEdition({
      editionDate: today.slice(0, 10),
      lead: filtered.articles[0],
      sections: [],
    });
    assert.equal((await recentPublishedStories()).length, 2);
    assert.equal(
      (await filterPreviouslyPublished([candidate])).rejected.length,
      1,
    );
  } finally {
    closeMemory();
    Object.assign(config, oldConfig);
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("regeneration ignores only its own edition date and replaces that date's history", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-regenerate-"),
  );
  const previous = {
    memoryFile: config.memoryFile,
    historyEnabled: config.historyEnabled,
  };
  config.memoryFile = path.join(directory, "history.sqlite");
  config.historyEnabled = true;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const older = {
    link: "https://example.org/old",
    originalTitle: "Astrônomos identificam planeta distante",
    headline: "Astrônomos identificam planeta distante",
    topicKey: "planeta-distante",
    category: "ciencia",
    source: "Example",
  };
  const current = {
    link: "https://example.org/current",
    originalTitle: "Banco divulga resultados trimestrais",
    headline: "Banco divulga resultados trimestrais",
    topicKey: "resultados-banco",
    category: "economia",
    source: "Example",
  };
  try {
    await rememberEdition({
      editionDate: yesterday,
      lead: older,
      sections: [],
    });
    await rememberEdition({ editionDate: today, lead: current, sections: [] });
    assert.equal(
      (await filterPreviouslyPublished([older, current])).articles.length,
      0,
    );
    const filtered = await filterPreviouslyPublished(
      [older, current],
      config.duplicateThreshold,
      { excludeEditionDate: today },
    );
    assert.deepEqual(
      filtered.articles.map((story) => story.link),
      [current.link],
    );
    await rememberEdition({
      editionDate: today,
      lead: {
        ...current,
        link: "https://example.org/replacement",
        headline: "Banco atualiza os resultados",
      },
      sections: [],
    });
    const history = await recentPublishedStories();
    assert.equal(history.length, 2);
    assert.ok(
      history.some(
        (story) => story.editionDate === yesterday && story.link === older.link,
      ),
    );
    assert.ok(!history.some((story) => story.link === current.link));
  } finally {
    closeMemory();
    Object.assign(config, previous);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
