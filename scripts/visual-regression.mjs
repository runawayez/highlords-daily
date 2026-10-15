import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { findBrowser } from "../src/services/browser.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { renderHtmlPdf } from "../src/services/html-pdf.mjs";
import { updateArchive } from "../src/services/archive.mjs";
import { layoutFixture } from "../tests/fixtures/layout.mjs";
import { editionStories } from "../src/editorial/audit.mjs";
import { option } from "./editorial-fixture-run.mjs";

const directory = path.resolve(
  option(process.argv.slice(2), "--output", "data/visual-regression"),
);
const edition = layoutFixture();
const editionDir = path.join(directory, edition.editionDate);
await fs.mkdir(editionDir, { recursive: true });
const html = renderNewsletterHtml(edition);
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
await fs.writeFile(pdfPath, await renderHtmlPdf(html, { baseDir: editionDir }));
// Poppler is optional for local previews, required in the visual CI job.
const text = spawnSync("pdftotext", ["-layout", pdfPath, "-"], {
  encoding: "utf8",
});
let pdfChecks =
  "skipped: install Poppler (pdftotext) for pagination assertions";
if (!text.error && text.status === 0) {
  const pages = text.stdout.split("\f").filter((content) => content.trim());
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
const report = {
  html: results,
  archive: "search/filter/persistent-feedback passed",
  pdf: pdfChecks,
};
await fs.writeFile(
  path.join(directory, "checks.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
