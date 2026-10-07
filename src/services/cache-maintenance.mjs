import fs from "node:fs/promises";
import path from "node:path";
import { DiskCache } from "../utils/storage.mjs";
import { config } from "../config.mjs";
export async function maintainCache({
  directory = config.cacheDir,
  maxBytes = config.cacheMaxBytes,
} = {}) {
  const cache = new DiskCache(directory);
  await cache.prune();
  const binaries = path.join(directory, "image-binaries");
  let removed = 0;
  for (const name of await fs.readdir(binaries).catch(() => [])) {
    if (!name.endsWith(".bin")) continue;
    const file = path.join(binaries, name);
    const metadata = path.join(
      directory,
      "image-files",
      `${name.slice(0, -4)}.json`,
    );
    try {
      await fs.access(metadata);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.rm(file, { force: true });
      removed++;
    }
  }
  const entries = [];
  for (const namespace of await fs
    .readdir(directory, { withFileTypes: true })
    .catch(() => [])) {
    if (!namespace.isDirectory()) continue;
    const base = path.join(directory, namespace.name);
    for (const name of await fs.readdir(base)) {
      const file = path.join(base, name);
      const stat = await fs.stat(file);
      if (stat.isFile())
        entries.push({ file, size: stat.size, modified: stat.mtimeMs });
    }
  }
  let bytes = entries.reduce((sum, item) => sum + item.size, 0);
  for (const entry of entries.sort((a, b) => a.modified - b.modified)) {
    if (bytes <= maxBytes) break;
    await fs.rm(entry.file, { force: true });
    bytes -= entry.size;
    removed++;
  }
  return { bytes, removed };
}
