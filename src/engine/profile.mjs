import { parseEnv } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { fields, fileFields } from "../config-options.mjs";
export async function profileEnvironment(file, baseEnv = process.env) {
  const absolute = path.resolve(file);
  const base = path.dirname(absolute);
  const document = parseYaml(await fs.readFile(absolute, "utf8"));
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw new Error("Profile must be a YAML/JSON object.");
  const environment = { ...baseEnv };
  // Browser installation paths are machine capabilities, like PATH, and may
  // be shared. Publication identity, policy, state and delivery never inherit.
  for (const field of Object.values(fields))
    if (!["BROWSER_PATH", "PUPPETEER_EXECUTABLE_PATH"].includes(field))
      delete environment[field];
  for (const name of Object.keys(environment))
    if (/^(EDITORIAL_|SMTP_|EMAIL_|TELEGRAM_|DISCORD_)/.test(name))
      delete environment[name];
  environment.HIGHLORDS_PROFILE = "true";
  environment.PRESET = document.preset || "global";
  for (const [key, value] of Object.entries(document)) {
    if (key === "secretsFile") {
      if (typeof value !== "string" || !value.trim())
        throw new Error("secretsFile must be a path.");
      const secrets = parseEnv(
        await fs.readFile(path.resolve(base, String(value)), "utf8"),
      );
      for (const [secret, content] of Object.entries(secrets))
        if (/^(SMTP_|EMAIL_|TELEGRAM_|DISCORD_)/.test(secret))
          environment[secret] = content;
      continue;
    }
    if (!fields[key]) throw new Error(`Unknown profile option: ${key}`);
    if (
      !["string", "number", "boolean"].includes(typeof value) &&
      !Array.isArray(value)
    )
      throw new Error(`Invalid profile option: ${key}`);
    environment[fields[key]] = fileFields.has(key)
      ? path.resolve(base, String(value))
      : Array.isArray(value)
        ? value.join(",")
        : String(value);
  }
  if (!document.dataDir || !document.outputDir)
    throw new Error("Each profile must define isolated dataDir and outputDir.");
  environment.MEMORY_FILE ||= path.join(
    environment.DATA_DIR,
    "highlords.sqlite",
  );
  // A inherited .env must not accidentally mix two publication histories.
  if (!document.memoryFile)
    environment.MEMORY_FILE = path.join(
      environment.DATA_DIR,
      "highlords.sqlite",
    );
  if (!document.cacheDir)
    environment.CACHE_DIR = path.join(environment.DATA_DIR, "cache");
  return environment;
}
export function takeProfile(args) {
  const index = args.indexOf("--config");
  if (index < 0) return { file: null, args };
  const file = args[index + 1];
  if (!file || file.startsWith("--"))
    throw new Error("--config needs a profile file.");
  return { file, args: args.filter((_, i) => i !== index && i !== index + 1) };
}
