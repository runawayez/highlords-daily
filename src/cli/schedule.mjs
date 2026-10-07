import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { config } from "../config.mjs";
import { atomicWrite } from "../utils/storage.mjs";
import { schedulePlan } from "../engine/scheduler.mjs";
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const available =
  process.platform === "linux" &&
  spawnSync("systemctl", ["--user", "show-environment"], { stdio: "ignore" })
    .status === 0;
const backend = value("--backend", available ? "systemd" : "cron");
if (!["systemd", "cron", "auto"].includes(backend))
  throw new Error("Use --backend systemd or cron.");
const plan = schedulePlan({
  root,
  dataDir: config.dataDir,
  profileFile: value("--config", null),
  time: value("--time", "07:00"),
  deliver: args.includes("--deliver"),
  backend,
});
if (args.includes("--dry-run"))
  console.log(JSON.stringify({ ...plan, timeZone: config.timeZone }, null, 2));
else {
  const run = (command, parameters, { allowFailure = false, input } = {}) => {
    const result = spawnSync(command, parameters, { encoding: "utf8", input });
    if ((result.error || result.status !== 0) && !allowFailure)
      throw new Error(
        result.error?.message || result.stderr || `${command} failed`,
      );
    return result;
  };
  const remove = args.includes("--remove");
  await fs.mkdir(plan.directory, { recursive: true });
  if (plan.backend === "task-scheduler") {
    if (remove) run(...plan.remove, { allowFailure: true });
    else {
      for (const file of plan.files) await atomicWrite(file.file, file.content);
      run(...plan.command);
    }
  } else if (plan.backend === "launchd") {
    const directory = path.join(os.homedir(), "Library", "LaunchAgents");
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, plan.files[0].file);
    run("launchctl", ["unload", file], { allowFailure: true });
    if (remove) await fs.rm(file, { force: true });
    else {
      await atomicWrite(file, plan.files[0].content);
      run("launchctl", ["load", file]);
    }
  } else if (plan.backend === "systemd") {
    const directory = path.join(os.homedir(), ".config", "systemd", "user");
    await fs.mkdir(directory, { recursive: true });
    if (remove) {
      run("systemctl", ["--user", "disable", "--now", `${plan.name}.timer`], {
        allowFailure: true,
      });
      for (const file of plan.files)
        await fs.rm(path.join(directory, file.file), { force: true });
    } else {
      for (const file of plan.files)
        await atomicWrite(path.join(directory, file.file), file.content);
    }
    run("systemctl", ["--user", "daemon-reload"]);
    if (!remove)
      run("systemctl", ["--user", "enable", "--now", `${plan.name}.timer`]);
  } else {
    const existing =
      run("crontab", ["-l"], { allowFailure: true }).stdout || "";
    const lines = existing
      .split(/\r?\n/)
      .filter((line) => !line.endsWith(`# ${plan.name}`));
    if (!remove) lines.push(plan.line);
    run("crontab", ["-"], { input: lines.filter(Boolean).join("\n") + "\n" });
  }
  console.log(
    remove
      ? "Schedule removed."
      : `Daily generation after ${value("--time", "07:00")} (${config.timeZone}); checks every 5 minutes, catches up on the current day when available. Ollama must already be running.`,
  );
}
