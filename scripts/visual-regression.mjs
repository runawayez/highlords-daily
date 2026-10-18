import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { findBrowser } from "../src/services/browser.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { renderHtmlPdf } from "../src/services/html-pdf.mjs";
import { optimizePdfImages } from "../src/services/pdf-images.mjs";
import { updateArchive } from "../src/services/archive.mjs";
import { designPreview } from "../tests/fixtures/design-preview.mjs";
import { unevenCopy } from "../tests/fixtures/uneven-copy.mjs";
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
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--allow-file-access-from-files",
  ],
});
const results = [];
let rasterPreview;
let rasterCompression;
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
  const unevenPath = path.join(directory, "uneven-copy.html");
  await fs.writeFile(unevenPath, renderNewsletterHtml(unevenCopy()));
  for (const width of [1120, 794, 390]) {
    await page.setViewport({ width, height: 1100 });
    await page.goto(pathToFileURL(unevenPath).href);
    await page.evaluate(() => document.fonts.ready);
    const fitting = await page.evaluate(() => {
      return [
        ...document.querySelectorAll(".newsletter-section .section-grid"),
      ].map((row) => {
        window.highlordsFitRow(row);
        const mode = row.dataset.fit;
        const before = row.textContent;
        const score = () => {
          const height = row.getBoundingClientRect().height;
          const waste = row.classList.contains("fit-stack")
            ? 0
            : [...row.children].reduce((sum, card) => {
                const rect = card.getBoundingClientRect();
                return sum + (height - rect.height) * rect.width;
              }, 0) / row.getBoundingClientRect().width;
          return height + waste * 0.8;
        };
        const fitted = score();
        row.classList.remove("fit-wide-first", "fit-wide-last", "fit-stack");
        const baseline = score();
        window.highlordsFitRow(row);
        return {
          mode,
          improved: fitted < baseline - 16,
          sameText: row.textContent === before,
        };
      });
    });
    for (const row of fitting) {
      assert.ok(row.sameText, "Fitting must preserve every word");
      if (width > 760)
        assert.ok(
          row.mode && row.improved,
          "Uneven rows must improve in either story order",
        );
      else
        assert.equal(
          row.mode,
          undefined,
          "Mobile keeps a natural single-column flow",
        );
    }
    await page.screenshot({
      path: path.join(directory, `uneven-copy-${width}.png`),
      fullPage: true,
    });
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
  // Exercise the real local-file image path: raster photos are compressed,
  // alpha is retained, SVG art and the original files remain untouched.
  const rasters = await page.evaluate(() => {
    return [false, true].map((alpha) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1800;
      canvas.height = 1500;
      const context = canvas.getContext("2d");
      const pixels = context.createImageData(canvas.width, canvas.height);
      let seed = 42;
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = (seed >>> 24) % 50;
        const x = (offset / 4) % canvas.width;
        pixels.data[offset] = 40 + noise + (Math.floor(x / 20) % 80);
        pixels.data[offset + 1] = 90 + noise;
        pixels.data[offset + 2] = 140 + noise;
        pixels.data[offset + 3] = alpha ? 120 : 255;
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png");
    });
  });
  const files = await Promise.all(
    rasters.map(async (src, index) => {
      const filename = path.join(directory, `raster-${index}.png`);
      await fs.writeFile(filename, Buffer.from(src.split(",")[1], "base64"));
      return filename;
    }),
  );
  rasterPreview = designPreview();
  rasterPreview.lead.imageUrl = pathToFileURL(files[0]).href;
  const photo = rasterPreview.sections
    .find((section) => section.articles.some((story) => story.imageUrl))
    .articles.find((story) => story.imageUrl);
  photo.imageUrl = pathToFileURL(files[1]).href;
  const rasterPath = path.join(directory, "raster-images.html");
  await fs.writeFile(rasterPath, renderNewsletterHtml(rasterPreview));
  await page.goto(pathToFileURL(rasterPath).href);
  rasterCompression = await optimizePdfImages(page);
  assert.equal(rasterCompression.optimized, 2);
  assert.ok(
    rasterCompression.savedBytes > rasterCompression.originalBytes * 0.4,
    "Raster optimization must materially reduce the image payload",
  );
  const decoded = await page.$$eval(
    '.story-image img[src^="data:image/"]',
    async (images) => {
      const checks = [];
      for (const image of images.filter(
        (image) => !image.src.startsWith("data:image/svg"),
      )) {
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, 1, 1);
        checks.push({
          width: image.naturalWidth,
          height: image.naturalHeight,
          alpha: context.getImageData(0, 0, 1, 1).data[3],
          type: image.src.slice(0, 22),
        });
      }
      return checks;
    },
  );
  assert.ok(
    decoded.every((image) => Math.max(image.width, image.height) <= 1400),
  );
  assert.ok(
    decoded.some(
      (image) =>
        image.type.startsWith("data:image/jpeg") && image.alpha === 255,
    ),
  );
  assert.ok(
    decoded.some(
      (image) =>
        image.type.startsWith("data:image/png") &&
        image.alpha > 0 &&
        image.alpha < 255,
    ),
  );
  for (let index = 0; index < files.length; index++)
    assert.equal(
      (await fs.readFile(files[index])).toString("base64"),
      rasters[index].split(",")[1],
    );
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
  "uneven-copy",
  "raster-images",
  "text-only",
  "rtl",
  "legacy",
]) {
  let sample = designPreview();
  if (name === "uneven-copy") sample = unevenCopy();
  if (name === "raster-images") sample = rasterPreview;
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
    if (name === "uneven-copy")
      assert.equal(
        layout.fittedRows.length,
        2,
        "PDF must fit both long/short article orders",
      );
    if (name === "raster-images")
      assert.equal(layout.imageCompression.optimized, 2);
    if (name === "text-only") {
      assert.ok(
        layout.flowSplitStories > 0,
        "Whole stories should use space that a complete pair could not occupy",
      );
      assert.ok(
        layout.pageSummaries.at(-1).stories >= 2,
        "A short last story should share its page after rebalancing adjacent editorias",
      );
    }
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
const recoveredEdition = JSON.parse(
  await fs.readFile(path.join(upgradeEdition, "edition.json"), "utf8"),
);
const originalEdition = JSON.parse(preservedJson);
const { pdfLayout, pdfRecoveredAt, ...retainedStats } = recoveredEdition.stats;
assert.deepEqual(
  { ...recoveredEdition, stats: retainedStats },
  originalEdition,
);
assert.ok(pdfRecoveredAt);
assert.equal(pdfLayout.issues.length, 0);
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
  rasterCompression,
  archivedEditionUpgrade:
    "public CLI passed; JSON preserved; no Ollama required",
};
await fs.writeFile(
  path.join(directory, "checks.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
