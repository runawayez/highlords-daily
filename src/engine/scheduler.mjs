import path from "node:path";
import { digest } from "../utils/storage.mjs";
export function scheduledTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error("Use HH:MM for schedule time.");
  return value;
}
export function isDue(now, timeZone, time) {
  scheduledTime(time);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("hour")}:${get("minute")}` >= time;
}
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
const shell = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
const powershell = (value) => `'${String(value).replace(/'/g, "''")}'`;
export function schedulePlan({
  platform = process.platform,
  root,
  node = process.execPath,
  profileFile = null,
  time = "07:00",
  dataDir,
  deliver = false,
  backend = "auto",
}) {
  scheduledTime(time);
  if (/[\r\n]/.test(root + node + (profileFile || "") + dataDir))
    throw new Error("Schedule paths cannot contain newlines.");
  const identity = digest(path.resolve(dataDir)).slice(0, 12);
  const name = `highlords-${identity}`;
  const directory = path.join(dataDir, "scheduler");
  const args = [
    path.join(root, "src", "cli", "run.mjs"),
    "tick",
    "--time",
    time,
    "--unattended",
    ...(profileFile ? ["--config", path.resolve(profileFile)] : []),
    ...(deliver ? ["--deliver"] : []),
  ];
  const log = path.join(directory, "scheduler.log");
  if (platform === "win32") {
    const file = path.join(directory, "run.ps1");
    const content = `$ErrorActionPreference = 'Stop'\nSet-Location -LiteralPath ${powershell(root)}\n& ${powershell(node)} ${args.map(powershell).join(" ")} *>> ${powershell(log)}\nexit $LASTEXITCODE\n`;
    return {
      backend: "task-scheduler",
      name,
      directory,
      files: [{ file, content }],
      command: [
        "schtasks",
        [
          "/Create",
          "/SC",
          "MINUTE",
          "/MO",
          "5",
          "/TN",
          name,
          "/TR",
          `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${file}"`,
          "/F",
        ],
      ],
      remove: ["schtasks", ["/Delete", "/TN", name, "/F"]],
    };
  }
  if (platform === "darwin") {
    const label = `com.highlords.${identity}`;
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[node, ...args].map((arg) => `<string>${xml(arg)}</string>`).join("")}</array><key>WorkingDirectory</key><string>${xml(root)}</string><key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><true/><key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string></dict></plist>\n`;
    return {
      backend: "launchd",
      name: label,
      directory,
      files: [{ file: `${label}.plist`, content }],
    };
  }
  const command = [node, ...args].map(shell).join(" ");
  if (backend === "systemd") {
    const service = `[Unit]\nDescription=Highlords Daily (${identity})\n[Service]\nType=oneshot\nWorkingDirectory=${JSON.stringify(root).replace(/%/g, "%%")}\nExecStart=${[node, ...args].map((arg) => JSON.stringify(arg).replace(/%/g, "%%")).join(" ")}\n`;
    const timer = `[Unit]\nDescription=Highlords daily check\n[Timer]\nOnCalendar=*-*-* *:0/5:00\nPersistent=true\nUnit=${name}.service\n[Install]\nWantedBy=timers.target\n`;
    return {
      backend: "systemd",
      name,
      directory,
      files: [
        { file: `${name}.service`, content: service },
        { file: `${name}.timer`, content: timer },
      ],
    };
  }
  return {
    backend: "cron",
    name,
    directory,
    files: [],
    line: `*/5 * * * * cd ${shell(root)} && ${command} >> ${shell(log)} 2>&1 # ${name}`.replace(
      /%/g,
      "\\%",
    ),
  };
}
