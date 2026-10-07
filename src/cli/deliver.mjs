import path from "node:path";
import { config } from "../config.mjs";
import { editionDate, validateDate } from "../engine/run-state.mjs";
import { readJson } from "../utils/storage.mjs";
import { deliverEdition } from "../services/delivery.mjs";
const args = process.argv.slice(2);
const date = validateDate(
  args.find((arg) => !arg.startsWith("--")) || editionDate(config.timeZone),
);
const directory = path.join(config.outputDir, date);
const edition = await readJson(path.join(directory, "edition.json"));
if (!edition) throw new Error("Generate the edition before delivery.");
console.log(
  await deliverEdition(edition, directory, {
    forceUncertain: args.includes("--retry-uncertain"),
  }),
);
