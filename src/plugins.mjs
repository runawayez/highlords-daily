import { auditTransition } from "./editorial/audit.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.mjs";

export async function loadPlugins({ settings = config } = {}) {
  const required = new Set(settings.requiredPlugins || []);
  if (!settings.pluginsEnabled) {
    if (required.size)
      throw new Error(
        "Required editorial plugins cannot be disabled; use an explicit custom plugin policy.",
      );
    return [];
  }
  let entries;
  try {
    entries = await fs.readdir(settings.pluginsDir, { withFileTypes: true });
  } catch (error) {
    if (required.size || settings.enabledPlugins?.length)
      throw new Error(
        `Configured plugins directory unavailable: ${settings.pluginsDir}: ${error.message}`,
      );
    return [];
  }

  const available = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );
  for (const filename of new Set([
    ...required,
    ...(settings.enabledPlugins || []),
  ])) {
    if (!available.has(filename))
      throw new Error(`Configured plugin missing: ${filename}`);
    if (
      required.has(filename) &&
      settings.enabledPlugins &&
      !settings.enabledPlugins.includes(filename)
    )
      throw new Error(`Required plugin is not enabled: ${filename}`);
  }

  const plugins = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".plugin.mjs")) continue;
    if (
      settings.enabledPlugins &&
      !settings.enabledPlugins.includes(entry.name)
    )
      continue;
    const file = path.join(settings.pluginsDir, entry.name);
    try {
      const module = await import(
        `${pathToFileURL(file).href}?v=${Date.now()}`
      );
      const plugin =
        module.default && typeof module.default === "object"
          ? module.default
          : module;
      plugins.push({
        name: String(plugin.name || entry.name.replace(/\.plugin\.mjs$/, "")),
        module: plugin,
      });
    } catch (error) {
      if (required.has(entry.name))
        throw new Error(
          `Required plugin failed to load: ${entry.name}: ${error.message}`,
        );
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
      const before = current?.articles?.map((article) => ({ ...article }));
      const result = await fn(current, payload?.context);
      if (result !== undefined) current = result;
      if (before && current?.articles)
        auditTransition(
          before,
          current.articles,
          `plugin:${plugin.name}:${hook}`,
          "plugin-rejected",
        );
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
