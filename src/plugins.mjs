import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.mjs";

export async function loadPlugins() {
  if (!config.pluginsEnabled) return [];
  let entries;
  try {
    entries = await fs.readdir(config.pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const plugins = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".plugin.mjs")) continue;
    if (config.enabledPlugins && !config.enabledPlugins.includes(entry.name))
      continue;
    const file = path.join(config.pluginsDir, entry.name);
    try {
      const module = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
      const plugin =
        module.default && typeof module.default === "object"
          ? module.default
          : module;
      plugins.push({
        name: String(plugin.name || entry.name.replace(/\.plugin\.mjs$/, "")),
        module: plugin,
      });
    } catch (error) {
      console.warn(
        `  Plugin ${entry.name} ignorado: ${error.message || error}`,
      );
    }
  }
  return plugins;
}

export async function runPluginHook(plugins, hook, payload) {
  let current = payload;
  for (const plugin of plugins || []) {
    const fn = plugin?.module?.[hook];
    if (typeof fn !== "function") continue;
    try {
      const result = await fn(current, payload?.context);
      if (result !== undefined) current = result;
    } catch (error) {
      if (error?.fatal === true || plugin?.module?.fatal === true) throw error;
      console.warn(
        `  Plugin ${plugin.name} falhou em ${hook}: ${error.message || error}`,
      );
    }
  }
  return current;
}

export async function runPluginExporters(plugins, context) {
  const outputs = [];
  for (const plugin of plugins || []) {
    const fn = plugin?.module?.exportEdition;
    if (typeof fn !== "function") continue;
    try {
      const result = await fn(context);
      if (result) outputs.push({ plugin: plugin.name, result });
    } catch (error) {
      if (error?.fatal === true || plugin?.module?.fatal === true) throw error;
      console.warn(
        `  Plugin ${plugin.name} falhou ao exportar: ${error.message || error}`,
      );
    }
  }
  return outputs;
}
