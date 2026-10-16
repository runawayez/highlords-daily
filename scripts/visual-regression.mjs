import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { findBrowser } from "../src/services/browser.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { renderHtmlPdf } from "../src/services/html-pdf.mjs";
import { updateArchive } from "../src/services/archive.mjs";
import { designPreview } from "../tests/fixtures/design-preview.mjs";
import { layoutFixture } from "../tests/fixtures/layout.mjs";
import { editionStories } from "../src/editorial/audit.mjs";
import { option } from "./editorial-fixture-run.mjs";

const directory = path.resolve(
  option(process.argv.slice(2), "--output", "data/visual-regression"),
);
const edition = layoutFixture();
const editionDir = path.join(directory, edition.editionDate);
await fs.mkdir(editionDir, { recursive: true });
const logo = `data:image/svg+xml;base64,${(await fs.readFile(new URL("../public/assets/highlords-logo.svg", import.meta.url))).toString("base64")}`;
const html = renderNewsletterHtml(edition, logo);
await fs.writeFile(path.join(editionDir, "index.html"), html);
await fs.writeFile(
  path.join(editionDir, "edition.json"),
  JSON.stringify(edition),
);
const archive = await updateArchive(directory);
const browser = await puppeteer.launch({
  executablePath: findBrowser(),
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
try {
  const page = await browser.newPage();
  for (const width of [1120, 390]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(pathToFileURL(path.join(editionDir, "index.html")).href);
    await page.evaluate(() => document.fonts.ready);
    const issues = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      clippedText: [
        ...document.querySelectorAll(
          ".story-body h2,.story-body h3,.story-body p",
        ),
      ].filter((element) => element.scrollWidth > element.clientWidth + 2)
        .length,
      brokenImages: [...document.images].filter(
        (image) => !image.complete || !image.naturalWidth,
      ).length,
    }));
    assert.deepEqual(issues, {
      horizontalOverflow: false,
      clippedText: 0,
      brokenImages: 0,
    });
    await page.screenshot({
      path: path.join(directory, `edition-${width}.png`),
      fullPage: true,
    });
    results.push({ width, ...issues });
  }
  // Browser-level regression: search, accents, category/source filters, feedback.
  await page.goto(pathToFileURL(archive).href);
  await page.type("#search", "informacoes");
  assert.ok(await page.$eval("#editions", (element) => element.hidden));
  assert.ok(
    (await page.$$eval(
      ".archive-story:not([hidden])",
      (cards) => cards.length,
    )) > 0,
  );
  await page.select("#category", "layout-1");
  assert.equal(
    await page.$$eval(".archive-story:not([hidden])", (cards) => cards.length),
    2,
  );
  await page.select("#source", "Fonte 4");
  assert.equal(
    await page.$$eval(".archive-story:not([hidden])", (cards) => cards.length),
    1,
  );
  await page.select(
    ".archive-story:not([hidden]) .feedback-choice",
    "wrong-category",
  );
  await page.select(
    ".archive-story:not([hidden]) .feedback-category",
    "tecnologia",
  );
  await page.reload();
  assert.equal(
    await page.$eval(
      '.archive-story[data-index="3"] .feedback-choice',
      (element) => element.value,
    ),
    "wrong-category",
  );
  await page.screenshot({
    path: path.join(directory, "archive-mobile.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
}
const pdfPath = path.join(directory, "layout.pdf");
let pagination;
await fs.writeFile(
  pdfPath,
  await renderHtmlPdf(html, {
    baseDir: editionDir,
    onLayout: (value) => {
      pagination = value;
    },
  }),
);
assert.equal(pagination.design, "editorial-v2");
assert.equal(pagination.scale, 1);
assert.deepEqual(pagination.issues, []);
assert.ok(pagination.minimumBodyFontPx >= 13.3);
assert.equal(pagination.stories, editionStories(edition).length);
// Poppler is optional for local previews, required in the visual CI job.
const text = spawnSync("pdftotext", ["-layout", pdfPath, "-"], {
  encoding: "utf8",
});
let pdfChecks =
  "skipped: install Poppler (pdftotext) for pagination assertions";
if (!text.error && text.status === 0) {
  const pages = text.stdout.split("\f").filter((content) => content.trim());
  assert.equal(pages.length, pagination.pages);
  pages.forEach((content, index) =>
    assert.ok(
      content.includes(
        `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`,
      ),
      "Missing page number",
    ),
  );
  for (const story of editionStories(edition)) {
    const marker = story.stableId;
    const first = pages.findIndex((content) =>
      content.includes(`${marker}START`),
    );
    const last = pages.findIndex((content) => content.includes(`${marker}END`));
    assert.ok(
      first >= 0 && first === last,
      `${marker}: card missing or split across PDF pages`,
    );
  }
  assert.ok(
    pages.every((content) => content.trim().length > 100),
    "Nearly empty PDF page",
  );
  assert.ok(
    pages.some(
      (content) =>
        content.includes("eSports") && content.includes("STORY04START"),
    ),
    "Orphan eSports heading",
  );
  pdfChecks = {
    pages: pages.length,
    cards: editionStories(edition).length,
    noSplitCards: true,
    noOrphanHeading: true,
  };
} else if (process.env.REQUIRE_PDF_TEXT_CHECKS === "true")
  throw new Error(text.error?.message || text.stderr);
const variants = [];
for (const name of [
  "approved-design",
  "maximum-copy",
  "text-only",
  "rtl",
  "legacy",
]) {
  let sample = designPreview();
  if (name === "maximum-copy") {
    for (const story of editionStories(sample)) {
      story.headline =
        `${story.stableId} ${"Um título extenso para verificar a composição editorial e os limites de leitura. ".repeat(4)}`.slice(
          0,
          220,
        );
      story.summary =
        `${"Texto integral da fonte com contexto para verificar a paginação sem cortes nem redução global do tamanho das letras. ".repeat(10)}`.slice(
          0,
          900,
        );
    }
  }
  if (name === "text-only")
    for (const story of editionStories(sample)) {
      story.imageUrl = null;
      story.displayImage = false;
    }
  if (name === "rtl")
    for (const story of editionStories(sample)) {
      story.headline = "التقنية والمجتمع في حياتنا اليومية";
      story.summary =
        "تتناول هذه المادة تطورات التقنية وتأثيرها على المجتمع والعمل والحياة اليومية، مع تقديم سياق واضح يساعد القارئ على فهم الموضوع.";
      story.source = "مصدر توضيحي";
    }
  let sampleHtml = renderNewsletterHtml(sample);
  if (name === "rtl")
    sampleHtml = sampleHtml.replace(
      /<html[^>]*>/,
      '<html lang="ar-EG" dir="rtl">',
    );
  if (name === "legacy")
    sampleHtml =
      '<!doctype html><html lang="en"><head><style>body{margin:0}.shell{width:1060px;background:#f7f3e9;padding:30px}.story-card{padding:30px}h3{font-size:28px}</style></head><body><div class="shell"><article class="story-card"><h3>Legacy edition remains readable</h3><p>An archived HTML edition can still be exported.</p></article></div></body></html>';
  await fs.writeFile(path.join(directory, `${name}.html`), sampleHtml);
  let layout;
  await fs.writeFile(
    path.join(directory, `${name}.pdf`),
    await renderHtmlPdf(sampleHtml, {
      baseDir: directory,
      onLayout: (value) => {
        layout = value;
      },
    }),
  );
  if (name === "legacy") assert.equal(layout.design, "legacy");
  else {
    assert.equal(
      layout.stories,
      editionStories(sample).length,
      `${name}: missing story`,
    );
    assert.deepEqual(layout.issues, [], `${name}: invalid pagination`);
    assert.ok(layout.minimumBodyFontPx >= 13.3, `${name}: body text too small`);
    assert.ok(
      layout.pageSummaries.every((page) => page.stories > 0),
      `${name}: empty page`,
    );
    if (name === "approved-design")
      assert.ok(layout.pages <= 3, "Normal edition should remain compact");
  }
  variants.push({ name, ...layout });
}
// Upgrade an existing edition through the public CLI without inference or data loss.
const upgradeDirectory = path.join(directory, "upgrade");
const upgradeEdition = path.join(upgradeDirectory, "output", "2026-10-15");
await fs.mkdir(upgradeEdition, { recursive: true });
const preservedJson = JSON.stringify(designPreview());
await fs.writeFile(path.join(upgradeEdition, "edition.json"), preservedJson);
await fs.writeFile(
  path.join(upgradeEdition, "index.html"),
  '<html><body><div class="shell">Archived layout</div></body></html>',
);
const upgradeProfile = path.join(upgradeDirectory, "profile.json");
await fs.writeFile(
  upgradeProfile,
  JSON.stringify({
    preset: "br",
    dataDir: "data",
    outputDir: "output",
    autoOpen: false,
  }),
);
await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [
      "src/cli/run.mjs",
      "pdf",
      "--config",
      upgradeProfile,
      "--refresh-template",
    ],
    { env: { ...process.env, OLLAMA_HOST: "http://127.0.0.1:1" } },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  child.on("error", reject);
  child.on("close", (code) =>
    code === 0 ? resolve() : reject(new Error(output)),
  );
});
assert.equal(
  await fs.readFile(path.join(upgradeEdition, "edition.json"), "utf8"),
  preservedJson,
);
assert.ok(
  (await fs.readFile(path.join(upgradeEdition, "index.html"), "utf8")).includes(
    'data-design="editorial-v2"',
  ),
);
assert.ok(
  (await fs.readdir(upgradeEdition)).some((name) => name.endsWith(".pdf")),
);
const report = {
  html: results,
  archive: "search/filter/persistent-feedback passed",
  pdf: pdfChecks,
  pagination,
  variants,
  archivedEditionUpgrade:
    "public CLI passed; JSON preserved; no Ollama required",
};
await fs.writeFile(
  path.join(directory, "checks.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
