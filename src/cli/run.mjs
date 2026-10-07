import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { profileEnvironment, takeProfile } from "../engine/profile.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const commands = {
  tick: "src/cli/scheduled.mjs",
  daily: "src/daily.mjs",
  doctor: "src/cli/doctor.mjs",
  schedule: "src/cli/schedule.mjs",
  deliver: "src/cli/deliver.mjs",
  sources: "src/cli/sources.mjs",
  locale: "src/cli/locale.mjs",
  pdf: "src/cli/pdf-rerender.mjs",
  config: "src/cli/config-show.mjs",
  cache: "src/cli/cache-prune.mjs",
};
export async function runCommand(
  command,
  args = [],
  { environment = process.env, stdio = "inherit" } = {},
) {
  if (args.includes("--help") || command === "help") {
    console.log(
      `Highlords Daily commands: ${Object.keys(commands).join(", ")}.\nUse --config profile.yml to isolate a publication.\nDaily: --unattended --date YYYY-MM-DD --force --deliver\nSchedule: --time HH:MM --deliver --dry-run --backend systemd|cron --remove\nSources: --region ISO --languages ja,en --research --query Japan --site https://example.org --output feeds.yml\nDeliver: [YYYY-MM-DD] --retry-uncertain\nSee docs/ENGINE.md for configuration and recovery.`,
    );
    return;
  }
  if (!commands[command]) throw new Error(`Unknown command: ${command}`);
  const parsed = takeProfile(args);
  const env = parsed.file
    ? await profileEnvironment(parsed.file, environment)
    : { ...environment };
  if (parsed.args.includes("--unattended")) {
    env.UNATTENDED = "true";
    env.AUTO_OPEN = "false";
  }
  const forwarded = parsed.args.filter((arg) => arg !== "--unattended");
  if (command === "schedule" && parsed.file)
    forwarded.push("--config", path.resolve(parsed.file));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, commands[command]), ...forwarded],
      { cwd: root, env, stdio },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCommand(process.argv[2] || "daily", process.argv.slice(3)).catch(
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
