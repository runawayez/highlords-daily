import fs from "node:fs/promises";
import path from "node:path";
import { renderNewsletterHtml } from "../src/template.mjs";
import { renderHtmlPdf } from "../src/services/html-pdf.mjs";
import { designPreview } from "../tests/fixtures/design-preview.mjs";
import { option } from "./editorial-fixture-run.mjs";
const directory = path.resolve(
  option(process.argv.slice(2), "--output", "output/layout-preview"),
);
await fs.mkdir(directory, { recursive: true });
const html = renderNewsletterHtml(designPreview());
await fs.writeFile(path.join(directory, "index.html"), html);
const pdf = await renderHtmlPdf(html, {
  baseDir: directory,
  onLayout: (layout) => console.log(JSON.stringify(layout)),
});
await fs.writeFile(path.join(directory, "highlords-layout-preview.pdf"), pdf);
console.log(
  `HTML: ${path.join(directory, "index.html")}\nPDF: ${path.join(directory, "highlords-layout-preview.pdf")}`,
);
