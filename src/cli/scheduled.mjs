import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.mjs";
import { isDue } from "../engine/scheduler.mjs";
import { main } from "../daily.mjs";
const args = process.argv.slice(2);
const index = args.indexOf("--time");
const time = index >= 0 ? args[index + 1] : "07:00";
if (isDue(new Date(), config.timeZone, time)) {
  const directory = path.join(config.dataDir, "scheduler");
  await fs.mkdir(directory, { recursive: true });
  const log = path.join(directory, "scheduler.log");
  try {
    if ((await fs.stat(log)).size > 5 * 1024 * 1024) {
      await fs.rm(`${log}.1`, { force: true });
      await fs.rename(log, `${log}.1`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await main({ deliver: args.includes("--deliver") });
}
