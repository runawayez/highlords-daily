import fs from "node:fs/promises";
import path from "node:path";
import { config, publication } from "../config.mjs";
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
  const requested = process.argv[2];
  const editionDate = requested || (await latestEditionDate());
  if (!editionDate || !validDate(editionDate)) {
    throw new Error(
      "Informe uma edição no formato AAAA-MM-DD ou gere uma edição primeiro.",
    );
  }

  const editionDir = path.join(config.outputDir, editionDate);
  const htmlPath = path.join(editionDir, "index.html");
  const html = await fs.readFile(htmlPath, "utf8");

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
  await Promise.all([fs.writeFile(pdfPath, pdf), fs.writeFile(latestPdf, pdf)]);

  console.log(`PDF: ${pdfPath}`);
  console.log(`Latest: ${latestPdf}`);
}

main().catch((error) => {
  console.error(`\nErro: ${error.message || error}`);
  process.exitCode = 1;
});
