import { config } from "../config.mjs";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const rules = fs.existsSync(config.routingFile)
  ? await import(pathToFileURL(config.routingFile).href)
  : {};
export function applyEditorialGuardrails(article) {
  return typeof rules.applyEditorialGuardrails === "function"
    ? rules.applyEditorialGuardrails(article)
    : article;
}
