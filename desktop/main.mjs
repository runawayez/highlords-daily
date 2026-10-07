import { envValue } from "./core/src/utils/env.mjs";
import { parseEnv } from "node:util";
import { hasOllamaModel } from "./core/src/utils/ollama-model.mjs";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let win;
let running = false;
let ollamaProcess = null;

const projectRoot = () =>
  app.isPackaged
    ? path.join(app.getAppPath(), "core")
    : path.resolve(here, "..");
const workspace = () =>
  app.isPackaged ? app.getPath("userData") : projectRoot();
const envPath = () => path.join(workspace(), ".env");

async function loadEnv() {
  try {
    return parseEnv(await fs.readFile(envPath(), "utf8"));
  } catch {
    return {};
  }
}

async function saveEnv(changes) {
  const current = await loadEnv();
  const next = { ...current, ...changes };
  const preferred = [
    "PRESET",
    "EDITORIAL_PROFILE",
    "LANGUAGE",
    "EDITORIAL_CONTEXT",
    "TIME_ZONE",
    "PUBLICATION_NAME",
    "PUBLICATION_TAGLINE",
    "OLLAMA_MODEL",
    "ITEMS_PER_CATEGORY",
    "MAX_ITEMS_PER_SOURCE",
    "REQUIRE_IMAGES",
    "CACHE_IMAGES",
    "HISTORY_ENABLED",
    "AUTO_OPEN",
  ];
  const keys = [
    ...preferred.filter((key) => key in next),
    ...Object.keys(next)
      .filter((key) => !preferred.includes(key))
      .sort(),
  ];
  await fs.mkdir(workspace(), { recursive: true });
  await fs.writeFile(
    envPath(),
    `${keys.map((key) => `${key}=${envValue(next[key])}`).join("\n")}\n`,
    "utf8",
  );
  return next;
}

async function apiReady(host) {
  try {
    const response = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function ensureOllama(env) {
  const host = String(env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
  let tags = await apiReady(host);
  if (!tags) {
    ollamaProcess = spawn("ollama", ["serve"], {
      detached: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    ollamaProcess.stdout?.on("data", (chunk) =>
      win?.webContents.send("daily:log", chunk.toString()),
    );
    ollamaProcess.stderr?.on("data", (chunk) =>
      win?.webContents.send("daily:log", chunk.toString()),
    );
    let startError;
    ollamaProcess.on("error", (error) => {
      startError = error;
    });
    for (let i = 0; i < 30 && !tags; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (startError)
        throw new Error(
          `Não foi possível iniciar Ollama: ${startError.message}`,
        );
      tags = await apiReady(host);
    }
  }
  if (!tags)
    throw new Error(
      "Ollama não respondeu. Instale/inicie o Ollama e tente novamente.",
    );

  const model = env.OLLAMA_MODEL || "qwen3:4b";
  const names = Array.isArray(tags.models)
    ? tags.models.map((item) => item.name)
    : [];
  if (!hasOllamaModel(names, model)) {
    await new Promise((resolve, reject) => {
      const pull = spawn("ollama", ["pull", model], {
        windowsHide: true,
        env: { ...process.env, OLLAMA_HOST: host },
      });
      pull.stdout.on("data", (chunk) =>
        win?.webContents.send("daily:log", chunk.toString()),
      );
      pull.stderr.on("data", (chunk) =>
        win?.webContents.send("daily:log", chunk.toString()),
      );
      pull.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ollama pull falhou (${code})`)),
      );
      pull.on("error", reject);
    });
  }
  return host;
}

function packagedEnv(base) {
  if (!app.isPackaged) return base;
  const root = projectRoot();
  const preset = base.PRESET || "br";
  return {
    ...base,
    PRESET_DIR: path.join(root, "presets", preset),
    EDITORIAL_PROFILES_FILE: path.join(
      root,
      "config",
      "editorial-profiles.yml",
    ),
    PUBLICATION_LOGO:
      base.PUBLICATION_LOGO ||
      path.join(root, "public", "assets", "highlords-logo.svg"),
    OUTPUT_DIR: base.OUTPUT_DIR || path.join(workspace(), "output"),
    DATA_DIR: base.DATA_DIR || path.join(workspace(), "data"),
    MEMORY_FILE:
      base.MEMORY_FILE || path.join(workspace(), "data", "highlords.sqlite"),
    PLUGINS_DIR: base.PLUGINS_DIR || path.join(root, "plugins"),
  };
}

async function generate() {
  if (running) return { ok: false, error: "Uma geração já está em andamento." };
  running = true;
  win?.webContents.send("daily:status", "running");
  try {
    const localEnv = await loadEnv();
    const host = await ensureOllama(localEnv);
    const env = packagedEnv({ ...localEnv, OLLAMA_HOST: host });
    const script = path.join(projectRoot(), "src", "daily.mjs");
    const executable = process.execPath;
    const childEnv = { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1" };

    const code = await new Promise((resolve, reject) => {
      const child = spawn(executable, [script], {
        cwd: workspace(),
        env: childEnv,
        windowsHide: true,
      });
      child.stdout.on("data", (chunk) =>
        win?.webContents.send("daily:log", chunk.toString()),
      );
      child.stderr.on("data", (chunk) =>
        win?.webContents.send("daily:log", chunk.toString()),
      );
      child.on("error", reject);
      child.on("exit", resolve);
    });
    if (code !== 0) throw new Error(`Geração encerrou com código ${code}.`);
    win?.webContents.send("daily:status", "done");
    return { ok: true };
  } catch (error) {
    win?.webContents.send("daily:status", "error");
    return { ok: false, error: error.message || String(error) };
  } finally {
    running = false;
    if (ollamaProcess && !ollamaProcess.killed) {
      try {
        ollamaProcess.kill();
      } catch {}
      ollamaProcess = null;
    }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#0b0b0d",
    webPreferences: {
      preload: path.join(here, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(here, "index.html"));
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    await fs.mkdir(path.join(workspace(), "plugins"), { recursive: true });
    await fs.mkdir(path.join(workspace(), "data"), { recursive: true });
  }
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("config:load", async () => loadEnv());
ipcMain.handle("config:save", async (_event, changes) => ({
  ok: true,
  config: await saveEnv(changes),
}));
ipcMain.handle("daily:generate", async () => generate());
ipcMain.handle("output:open", async () => {
  const env = packagedEnv(await loadEnv());
  const outputDir = path.resolve(
    env.OUTPUT_DIR || path.join(workspace(), "output"),
  );
  const file = path.join(outputDir, "index.html");
  if (!fsSync.existsSync(file))
    return { ok: false, error: "Gere pelo menos uma edição primeiro." };
  await shell.openPath(file);
  return { ok: true };
});
