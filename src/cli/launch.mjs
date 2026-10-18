// Shared Windows/macOS/Linux bootstrap. Only Node built-ins are loaded before npm ci.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { dependencyState } from "../services/dependencies.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
function command(
  executable,
  args,
  { capture = false, env = process.env } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      windowsHide: true,
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(`${path.basename(executable)} exited with code ${code}`),
          ),
    );
  });
}
export function localOllama(host) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(host).hostname);
}
async function tags(host) {
  try {
    const response = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
async function pullModel(host, name) {
  const response = await fetch(`${host}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!response.ok)
    throw new Error(`Ollama model download HTTP ${response.status}`);
  let pending = "",
    previous = "";
  const decoder = new TextDecoder();
  const row = (line) => {
    if (!line.trim()) return;
    const value = JSON.parse(line);
    if (value.error) throw new Error(value.error);
    if (value.status && value.status !== previous) {
      console.log(`  ${value.status}`);
      previous = value.status;
    }
  };
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = pending.indexOf("\n")) >= 0) {
      row(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
    }
  }
  pending += decoder.decode();
  row(pending);
}
export async function launch(args = process.argv.slice(2)) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw new Error(
      "Instale o Node.js LTS em https://nodejs.org e abra novamente o programa. / Node.js 22.12+ is required.",
    );
  const dependencies = await dependencyState(root);
  if (!dependencies.current) {
    console.log(
      "Preparando os componentes do jornal... / Preparing the newspaper components...",
    );
    if (process.platform === "win32")
      await command(process.env.ComSpec || "cmd.exe", [
        "/d",
        "/s",
        "/c",
        "npm.cmd ci",
      ]);
    else await command("npm", ["ci"]);
    await fs.writeFile(dependencies.marker, dependencies.fingerprint);
  }
  const run = path.join(root, "src", "cli", "run.mjs");
  const profileIndex = args.indexOf("--config");
  const profileArgs =
    profileIndex < 0 ? [] : args.slice(profileIndex, profileIndex + 2);
  const setupOnly = args.includes("--setup-only");
  if (setupOnly && profileIndex >= 0)
    throw new Error(
      "Use --setup-only without --config to configure this installation.",
    );
  const configured = await fs.access(path.join(root, ".env")).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  if (setupOnly || (!configured && profileIndex < 0)) {
    if (
      args.includes("--unattended") ||
      ["1", "true", "yes", "on"].includes(
        String(process.env.UNATTENDED || "").toLowerCase(),
      )
    )
      throw new Error(
        "Primeiro configure seu jornal: abra CONFIGURAR-DAILY.bat ou execute bash RUN-DAILY.sh --setup-only. / Complete setup before unattended use.",
      );
    await command(process.execPath, [
      path.join(root, "src", "cli", "setup.mjs"),
    ]);
    if (setupOnly) return;
    const saved = await fs.access(path.join(root, ".env")).then(
      () => true,
      () => false,
    );
    if (!saved)
      throw new Error(
        "A configuração não foi concluída; abra o programa novamente para configurar. / Setup was not completed.",
      );
  }
  const { config } = JSON.parse(
    await command(process.execPath, [run, "config", ...profileArgs], {
      capture: true,
    }),
  );
  let started, startError;
  const stop = async () => {
    if (!started || started.exitCode !== null || !started.pid) return;
    if (process.platform === "win32")
      await command("taskkill.exe", [
        "/PID",
        String(started.pid),
        "/T",
        "/F",
      ]).catch(() => {});
    else started.kill();
  };
  const interrupt = () => {
    void stop().finally(() => process.exit(130));
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    let available = await tags(config.ollamaHost);
    if (!available) {
      if (!localOllama(config.ollamaHost))
        throw new Error(`Remote Ollama unavailable: ${config.ollamaHost}`);
      console.log(
        "Preparando a inteligência artificial local... / Starting local AI...",
      );
      started = spawn("ollama", ["serve"], {
        env: { ...process.env, OLLAMA_HOST: config.ollamaHost },
        stdio: "ignore",
        windowsHide: true,
      });
      started.on("error", (error) => {
        startError = error;
      });
      for (let i = 0; i < 30 && !available; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (startError)
          throw new Error(
            startError.code === "ENOENT"
              ? "Instale o Ollama em https://ollama.com/download e abra novamente o programa. / Install Ollama and try again."
              : `Não consegui iniciar o Ollama. Abra o aplicativo e tente novamente. / ${startError.message}`,
          );
        if (started.exitCode !== null)
          throw new Error("Ollama exited before its API became ready.");
        available = await tags(config.ollamaHost);
      }
    }
    if (!available) throw new Error(`Ollama unavailable: ${config.ollamaHost}`);
    const { hasOllamaModel } = await import("../utils/ollama-model.mjs");
    if (
      !hasOllamaModel(
        (available.models || []).map((model) => model.name),
        config.ollamaModel,
      )
    ) {
      console.log(
        "Baixando a IA para preparar seu jornal. A primeira vez pode demorar... / Downloading local AI; the first run may take a while...",
      );
      await pullModel(config.ollamaHost, config.ollamaModel);
    }
    await command(process.execPath, [run, "doctor", ...profileArgs]);
    await command(process.execPath, [run, "daily", ...args]);
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await stop();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  launch().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
