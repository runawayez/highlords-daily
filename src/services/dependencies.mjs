import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export async function dependencyState(root) {
  const lock = await fs.readFile(path.join(root, "package-lock.json"));
  const fingerprint = createHash("sha256")
    .update(lock)
    .update(process.versions.node.split(".")[0])
    .digest("hex");
  const marker = path.join(root, "node_modules", ".highlords-lock");
  const previous = await fs.readFile(marker, "utf8").catch(() => "");
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  let installed = true;
  for (const name of Object.keys(manifest.dependencies || {}))
    try {
      await fs.access(path.join(root, "node_modules", name, "package.json"));
    } catch {
      installed = false;
    }
  return {
    current: installed && previous === fingerprint,
    fingerprint,
    marker,
  };
}
