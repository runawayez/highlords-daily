import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export function sourceFingerprint(directories) {
  const hash = createHash("sha256");
  function visit(directory) {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        hash.update(`missing:${directory}`);
        return;
      }
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(mjs|json|ya?ml)$/.test(entry.name)) {
        hash.update(file);
        hash.update(fs.readFileSync(file));
      }
    }
  }
  for (const directory of [...new Set(directories)]) visit(directory);
  return hash.digest("hex");
}
