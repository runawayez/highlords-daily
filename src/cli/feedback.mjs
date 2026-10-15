import fs from "node:fs/promises";
import { config, publication } from "../config.mjs";
import { importFeedback } from "../services/feedback.mjs";
const index = process.argv.indexOf("--file");
if (index < 0 || !process.argv[index + 1])
  throw new Error("Use feedback --file exported-feedback.json");
console.log(
  JSON.stringify(
    await importFeedback(
      JSON.parse(await fs.readFile(process.argv[index + 1], "utf8")),
      { dataDir: config.dataDir, publication: publication.slug },
    ),
    null,
    2,
  ),
);
