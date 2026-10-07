import { findBrowser } from "../services/browser.mjs";
import { hasOllamaModel } from "../utils/ollama-model.mjs";

let failures = 0;
async function check(label, action) {
  try {
    console.log(`OK   ${label}: ${await action()}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

await check("Node.js", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12))
    throw new Error("Instale Node.js 22.12 ou superior.");
  return process.versions.node;
});
let settings;
await check("Configuração", async () => {
  const { config, categories, feeds } = await import("../config.mjs");
  settings = config;
  new Intl.DateTimeFormat(config.language, { timeZone: config.timeZone });
  return `${categories.length} categorias, ${feeds.length} feeds; ${config.language}, ${config.region}, ${config.timeZone}; ${config.maxCandidates} candidatas`;
});
if (settings?.exportPdf) await check("Navegador para PDF", findBrowser);
if (settings) {
  await check("Ollama e modelo", async () => {
    const response = await fetch(`${settings.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status} em ${settings.ollamaHost}`);
    const data = await response.json();
    const names = (Array.isArray(data.models) ? data.models : []).map(
      (model) => model.name,
    );
    if (!hasOllamaModel(names, settings.ollamaModel))
      throw new Error(`Execute: ollama pull ${settings.ollamaModel}`);
    return `${settings.ollamaHost} / ${settings.ollamaModel}`;
  });
}
console.log(
  "\nEste diagnóstico não inicia serviços, baixa modelos ou gera edições.",
);
process.exitCode = failures ? 1 : 0;
