import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

async function checkDirectory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (
      entry.isDirectory() &&
      !["node_modules", "core", "dist"].includes(entry.name)
    ) {
      await checkDirectory(file);
    } else if (entry.isFile() && file.endsWith(".mjs")) {
      const result = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = 1;
    }
  }
}
for (const directory of [
  "src",
  "plugins",
  "desktop",
  "scripts",
  "tests",
  "presets",
])
  await checkDirectory(directory);
