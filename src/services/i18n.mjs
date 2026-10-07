import fs from "node:fs";
import { config } from "../config.mjs";
import { textDirection } from "../utils/text.mjs";
const base = JSON.parse(
  fs.readFileSync(new URL("../locales/en.json", import.meta.url), "utf8"),
);
export const localeKeys = Object.keys(base);
export function validateCatalog(value) {
  if (
    !value ||
    localeKeys.some(
      (key) => typeof value[key] !== "string" || !value[key].trim(),
    )
  )
    throw new Error("Locale catalog is incomplete.");
  return Object.fromEntries(localeKeys.map((key) => [key, value[key].trim()]));
}
export function uiCatalog(
  language = config.language,
  customFile = process.env.UI_LOCALE_FILE,
) {
  let catalog = base;
  if (customFile)
    catalog = validateCatalog(JSON.parse(fs.readFileSync(customFile, "utf8")));
  else {
    const code = new Intl.Locale(language).language;
    const url = new URL(`../locales/${code}.json`, import.meta.url);
    if (fs.existsSync(url))
      catalog = validateCatalog(JSON.parse(fs.readFileSync(url, "utf8")));
  }
  return { ...catalog };
}
export const direction = textDirection(config.language);
