import path from "node:path";
import { config } from "../config.mjs";
import { requestChat } from "../services/ollama-client.mjs";
import { uiCatalog, localeKeys, validateCatalog } from "../services/i18n.mjs";
import { atomicWrite } from "../utils/storage.mjs";
const args = process.argv.slice(2);
const index = args.indexOf("--output");
const file =
  index >= 0
    ? args[index + 1]
    : path.join(config.dataDir, "locales", `${config.language}.json`);
const schema = {
  type: "object",
  properties: Object.fromEntries(
    localeKeys.map((key) => [key, { type: "string" }]),
  ),
  required: localeKeys,
  additionalProperties: false,
};
const translated = validateCatalog(
  await requestChat(
    `Translate the UI catalog into ${config.language}. Preserve every key. Return JSON only.`,
    JSON.stringify(uiCatalog("en", null)),
    { schema },
  ),
);
await atomicWrite(file, JSON.stringify(translated, null, 2));
console.log(
  `Review ${file}, then set UI_LOCALE_FILE to use this persistent translation.`,
);
