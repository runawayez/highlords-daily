import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { digest, atomicWrite, readJson } from "../utils/storage.mjs";
export function editionDate(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key) => parts.find((part) => part.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function validateDate(value) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid edition date; use YYYY-MM-DD.");
  return value;
}
export async function acquireLock(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const token = randomUUID();
  const metadata = {
    pid: process.pid,
    hostname: os.hostname(),
    token,
    createdAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, "wx");
      try {
        await handle.writeFile(JSON.stringify(metadata));
      } finally {
        await handle.close();
      }
      return async () => {
        if ((await readJson(file))?.token === token)
          await fs.rm(file, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await readJson(file);
      // Never take over a remote/shared-machine lock or an incompletely written lock.
      if (
        existing?.hostname === os.hostname() &&
        Number.isInteger(existing.pid)
      ) {
        try {
          process.kill(existing.pid, 0);
        } catch (failure) {
          if (failure.code === "ESRCH") {
            await fs.rm(file, { force: true });
            continue;
          }
        }
      }
      throw new Error(`Publication already running; lock: ${file}`);
    }
  }
  throw new Error(`Cannot acquire publication lock: ${file}`);
}
export class RunState {
  constructor(directory, fingerprint, { force = false } = {}) {
    this.directory = directory;
    this.fingerprint = fingerprint;
    this.force = force;
  }
  async init() {
    this.file = path.join(this.directory, "run.json");
    const previous = await readJson(this.file);
    this.state =
      !this.force && previous?.fingerprint === this.fingerprint
        ? previous
        : {
            fingerprint: this.fingerprint,
            status: "running",
            stages: {},
            startedAt: new Date().toISOString(),
          };
    return this;
  }
  async stage(name, action) {
    const file = path.join(this.directory, `${name}.json`);
    if (this.state.stages[name]) {
      const cached = await readJson(file);
      if (cached !== null && digest(cached) === this.state.stages[name].digest)
        return cached;
    }
    const order = ["collected", "analyzed", "ranked", "selected"];
    for (const stage of order.slice(Math.max(0, order.indexOf(name))))
      delete this.state.stages[stage];
    const result = await action();
    await atomicWrite(file, JSON.stringify(result));
    this.state.stages[name] = {
      completedAt: new Date().toISOString(),
      digest: digest(result),
    };
    await this.save();
    return result;
  }
  async save() {
    await atomicWrite(this.file, JSON.stringify(this.state, null, 2));
  }
}
