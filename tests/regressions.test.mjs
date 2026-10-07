import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderEmailHtml } from "../src/exporters/email.mjs";
import { hasOllamaModel } from "../src/utils/ollama-model.mjs";
import { updateArchive } from "../src/services/archive.mjs";
import { loadPlugins, runPluginHook } from "../src/plugins.mjs";
import { config } from "../src/config.mjs";

test("email escapes untrusted content and blocks executable link/image protocols", () => {
  const html = renderEmailHtml({
    title: "<script>alert(1)</script>",
    intro: "A & B",
    editionDate: "2026-10-07",
    lead: {
      headline: '"Unsafe"',
      source: "<source>",
      link: "javascript:alert(1)",
      originalImageUrl: "file:///etc/passwd",
    },
    sections: [],
  });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
  assert.ok(html.includes('href="#"'));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("file:"));
});

test("model detection does not substitute a different tag or similarly named model", () => {
  assert.equal(
    hasOllamaModel(["qwen3:4b-instruct", "qwen3:40b"], "qwen3:4b"),
    false,
  );
  assert.equal(hasOllamaModel(["qwen3:4b"], "qwen3"), false);
  assert.equal(hasOllamaModel(["qwen3:latest"], "qwen3"), true);
  assert.equal(hasOllamaModel(["qwen3:4b"], "qwen3:4b"), true);
});

test("archive orders dated editions, escapes titles and skips broken data", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-archive-"),
  );
  try {
    for (const [date, content] of [
      ["2026-10-06", JSON.stringify({ title: "Older" })],
      [
        "2026-10-07",
        JSON.stringify({
          title: "<Latest>",
          stats: { stories: 2, sources: 1 },
        }),
      ],
      ["2026-10-08", "{broken"],
    ]) {
      await fs.mkdir(path.join(directory, date));
      await fs.writeFile(path.join(directory, date, "edition.json"), content);
    }
    const target = await updateArchive(directory);
    const html = await fs.readFile(target, "utf8");
    assert.ok(html.includes("&lt;Latest&gt;"));
    assert.ok(html.indexOf("&lt;Latest&gt;") < html.indexOf("Older"));
    assert.ok(!html.includes("2026-10-08"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("plugins execute in filename order rather than directory listing order", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-plugins-"),
  );
  const previous = config.pluginsDir;
  const previousEnabled = config.enabledPlugins;
  config.enabledPlugins = null;
  try {
    await fs.writeFile(
      path.join(directory, "20-second.plugin.mjs"),
      'export const afterCollect = value => value + "B";',
    );
    await fs.writeFile(
      path.join(directory, "10-first.plugin.mjs"),
      'export const afterCollect = value => value + "A";',
    );
    config.pluginsDir = directory;
    const result = await runPluginHook(await loadPlugins(), "afterCollect", "");
    assert.equal(result, "AB");
  } finally {
    config.pluginsDir = previous;
    config.enabledPlugins = previousEnabled;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("empty numeric overrides retain defaults and invalid CSS colors fall back", async () => {
  const { execFileSync } = await import("node:child_process");
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const {config, publication} = await import("./src/config.mjs"); console.log(JSON.stringify({score:config.llmMinScore,color:publication.accentColor}));',
    ],
    {
      encoding: "utf8",
      env: { ...process.env, LLM_MIN_SCORE: "", ACCENT_COLOR: "#12345" },
    },
  );
  assert.deepEqual(JSON.parse(result), { score: 4, color: "#c92f2b" });
});

test("saved dotenv values preserve Windows paths, quotes and colors", async () => {
  const { parseEnv } = await import("node:util");
  const { envValue } = await import("../src/utils/env.mjs");
  for (const value of [
    "C:\\Program Files\\Google\\Chrome",
    "#c92f2b",
    'A "quoted" title',
    "Reader's daily",
    "",
  ]) {
    assert.equal(parseEnv(`VALUE=${envValue(value)}`).VALUE, value);
  }
  assert.throws(() => envValue("safe\nINJECTED=true"), /única linha/);
});
