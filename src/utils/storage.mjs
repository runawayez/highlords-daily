import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
export const digest = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError)
      return fallback;
    throw error;
  }
}
export class DiskCache {
  constructor(directory) {
    this.directory = directory;
    this.inflight = new Map();
  }
  file(namespace, key) {
    return path.join(this.directory, namespace, `${digest(key)}.json`);
  }
  async get(namespace, key, { stale = false } = {}) {
    const item = await readJson(this.file(namespace, key));
    return item && (stale || item.expiresAt > Date.now()) ? item.value : null;
  }
  async set(namespace, key, value, ttlMs = 86400000) {
    await atomicWrite(
      this.file(namespace, key),
      JSON.stringify({ expiresAt: Date.now() + ttlMs, value }),
    );
    return value;
  }
  async remember(namespace, key, action, ttlMs) {
    const id = `${namespace}:${digest(key)}`;
    if (this.inflight.has(id)) return this.inflight.get(id);
    const promise = (async () => {
      const cached = await this.get(namespace, key);
      if (cached !== null) return cached;
      return this.set(namespace, key, await action(), ttlMs);
    })();
    this.inflight.set(id, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(id);
    }
  }
  async prune() {
    for (const namespace of await fs
      .readdir(this.directory, { withFileTypes: true })
      .catch(() => [])) {
      if (!namespace.isDirectory()) continue;
      const directory = path.join(this.directory, namespace.name);
      for (const filename of await fs.readdir(directory)) {
        if (!filename.endsWith(".json")) continue;
        const file = path.join(directory, filename);
        const item = await readJson(file);
        if (!item || item.expiresAt <= Date.now())
          await fs.rm(file, { force: true });
      }
    }
  }
}
