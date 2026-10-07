import fs from "node:fs/promises";
import path from "node:path";
import { config, publication } from "../config.mjs";
import { renderNewsletterHtml } from "../template.mjs";
import { acquireLock } from "../engine/run-state.mjs";
import { atomicWrite } from "../utils/storage.mjs";
import { renderHtmlPdf } from "../services/html-pdf.mjs";

function validDate(value = "") {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

async function latestEditionDate() {
  let entries = [];
  try {
    entries = await fs.readdir(config.outputDir, { withFileTypes: true });
  } catch {}

  const dates = entries
    .filter((entry) => entry.isDirectory() && validDate(entry.name))
    .map((entry) => entry.name)
    .sort();

  return dates.at(-1) || null;
}

async function main() {
  const args = process.argv.slice(2);
  const refreshTemplate = args.includes("--refresh-template");
  if (
    args.some((arg) => arg.startsWith("--") && arg !== "--refresh-template")
  ) {
    throw new Error("Use pdf:rerender -- [AAAA-MM-DD] [--refresh-template]");
  }
  const requested = args.find((arg) => !arg.startsWith("--"));
  const editionDate = requested || (await latestEditionDate());
  if (!editionDate || !validDate(editionDate)) {
    throw new Error(
      "Informe uma edição no formato AAAA-MM-DD ou gere uma edição primeiro.",
    );
  }

  const release = await acquireLock(
    path.join(config.dataDir, "publication.lock"),
  );
  try {
    const editionDir = path.join(config.outputDir, editionDate);
    const htmlPath = path.join(editionDir, "index.html");
    let html = await fs.readFile(htmlPath, "utf8");
    if (refreshTemplate) {
      const edition = JSON.parse(
        await fs.readFile(path.join(editionDir, "edition.json"), "utf8"),
      );
      const logo =
        html.match(/<img class="logo" src="(data:image\/[^"]+)"/)?.[1] || "";
      html = renderNewsletterHtml(edition, logo);
    }

    console.log(
      `Regenerando PDF da edição ${editionDate} a partir do index.html...`,
    );
    const pdf = await renderHtmlPdf(html, { baseDir: editionDir });

    const pdfPath = path.join(
      editionDir,
      `${publication.slug}-${editionDate}.pdf`,
    );
    const latestPdf = path.join(
      config.outputDir,
      `${publication.slug}-latest.pdf`,
    );
    await atomicWrite(pdfPath, pdf);
    if (refreshTemplate) await atomicWrite(htmlPath, html);
    if (editionDate === (await latestEditionDate()))
      await atomicWrite(latestPdf, pdf);

    console.log(`PDF: ${pdfPath}`);
  } finally {
    await release();
  }
}

main().catch((error) => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
