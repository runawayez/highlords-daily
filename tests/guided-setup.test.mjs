import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseEnv } from "node:util";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as yaml } from "yaml";
import {
  runSetup,
  SetupCancelled,
  numberedChoices,
} from "../src/setup/wizard.mjs";
import { buildSetupPlan, resolveCountry } from "../src/setup/plan.mjs";
import { checkSetupSource } from "../src/setup/source-check.mjs";
import { categories } from "../src/config.mjs";
import qualityGate from "../plugins/99-editorial-quality-gate.plugin.mjs";

const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), "highlords-setup-"));
const catalog = [
  {
    name: "Brazil Technology",
    url: "https://br.example/rss",
    country: "BR",
    language: "pt-BR",
    focus: ["tecnologia", "ia-desenvolvimento"],
    strict_focus: true,
  },
  {
    name: "US News",
    url: "https://us.example/rss",
    country: "US",
    language: "en-US",
    focus: ["ia", "economia"],
  },
  {
    name: "World Science",
    url: "https://world.example/rss",
    coverage: ["GLOBAL"],
    language: "en",
    focus: ["ciencia"],
  },
];
const preferences = {
  language: "pt-BR",
  residence: "US",
  coverage: ["BR", "US"],
  interests: ["technology", "business"],
  size: "balanced",
  timeZone: "America/New_York",
  exportPdf: false,
};
const answers = () => ["1", "1", "2", "1,2", "1,2", "2", "3", "2", "1"];
function options(root, replies = answers(), overrides = {}) {
  let output = "";
  return {
    root,
    catalog,
    machineZone: "UTC",
    ask: async () => replies.shift() ?? null,
    write: (text) => {
      output += text;
    },
    probe: async (source) => ({ language: source.language, items: 5 }),
    ...overrides,
    get output() {
      return output;
    },
  };
}

test("setup accepts simple numbered selections and full country names without technical codes", () => {
  assert.deepEqual(numberedChoices("1, 2,2", 3), [0, 1]);
  assert.deepEqual(numberedChoices("0", 3, { all: true }), [0, 1, 2]);
  for (const value of ["0,1", "4", "1,", "no", "-1"])
    assert.equal(numberedChoices(value, 3, { all: true }), null);
  assert.equal(resolveCountry("Estados Unidos"), "US");
  assert.equal(resolveCountry("Canadá"), "CA");
});

test("country and interest choices change actual source lists and never mix incompatible taxonomies", async () => {
  const us = await buildSetupPlan(
    { ...preferences, coverage: ["US"] },
    catalog,
  );
  assert.deepEqual(
    us.sources.map((source) => source.name),
    ["US News"],
  );
  const both = await buildSetupPlan(preferences, catalog);
  assert.equal(both.sources.length, 2);
  const slugs = new Set(both.categories.map((category) => category.slug));
  assert.ok(
    both.sources
      .flatMap((source) => source.focus)
      .every((slug) => slugs.has(slug)),
  );
  assert.ok(
    both.sources
      .find((source) => source.country === "BR")
      .focus.includes("desenvolvimento"),
  );
  assert.ok(both.categories.every((category) => category.required === false));
  assert.equal(
    both.sources.some((source) => source.name === "World Science"),
    false,
  );
});

test("Brazilian reader in the US configures Portuguese, US+BR sources and New York without editing files", async () => {
  const root = await temporary();
  const io = options(root);
  try {
    const result = await runSetup(io);
    assert.equal(result.cancelled, false);
    assert.deepEqual(result.preferences, {
      version: 1,
      setupLanguage: "pt",
      ...preferences,
    });
    const env = parseEnv(await fs.readFile(path.join(root, ".env"), "utf8"));
    assert.equal(env.LANGUAGE, "pt-BR");
    assert.equal(env.REGION, "US");
    assert.equal(env.COVERAGE, "BR,US");
    assert.equal(env.TIME_ZONE, "America/New_York");
    assert.equal(env.EXPORT_PDF, "false");
    assert.equal(env.OLLAMA_MODEL, "qwen3:4b");
    const sources = yaml(
      await fs.readFile(path.join(result.presetDir, "feeds.yml"), "utf8"),
    ).feeds;
    assert.deepEqual(
      new Set(sources.map((source) => source.country)),
      new Set(["BR", "US"]),
    );
    const command = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {config,feeds,categories} from ${JSON.stringify(new URL("../src/config.mjs", import.meta.url).href)}; console.log(JSON.stringify({language:config.language,feeds:feeds.length,required:categories.some(c=>c.required)}))`,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ...env,
          HIGHLORDS_PROFILE: "true",
          PRESET_DIR: result.presetDir,
        },
      },
    );
    assert.equal(command.status, 0, command.stderr);
    assert.deepEqual(JSON.parse(command.stdout), {
      language: "pt-BR",
      feeds: 2,
      required: false,
    });
    assert.ok(io.output.includes("Estados Unidos"));
    assert.ok(!/YAML|locale|ISO|FEEDS_FILE/.test(io.output));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("reconfiguration preserves model, delivery and data paths and backs up previous preferences", async () => {
  const root = await temporary();
  const original =
    "PRESET=nonexistent\nOLLAMA_MODEL=custom:8b\nSMTP_PASS=keep-secret\nDATA_DIR=./personal-state\n";
  try {
    await fs.writeFile(path.join(root, ".env"), original);
    const replies = answers();
    replies.splice(1, 0, "1");
    const result = await runSetup(options(root, replies));
    assert.equal(result.cancelled, false);
    const env = parseEnv(await fs.readFile(path.join(root, ".env"), "utf8"));
    assert.equal(env.DATA_DIR, "./personal-state");
    assert.equal(env.SMTP_PASS, "keep-secret");
    assert.equal(env.OLLAMA_MODEL, "custom:8b");
    const backup = (await fs.readdir(root)).find((name) =>
      name.startsWith(".env.backup-"),
    );
    assert.equal(await fs.readFile(path.join(root, backup), "utf8"), original);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("keeping saved preferences and cancelling confirmation never overwrite configuration", async () => {
  const root = await temporary();
  try {
    await fs.writeFile(path.join(root, ".env"), "LANGUAGE=pt-BR\n");
    const result = await runSetup(
      options(root, ["1", "2"], {
        probe: async () => {
          throw new Error("must not probe");
        },
      }),
    );
    assert.equal(result.cancelled, true);
    assert.equal(
      await fs.readFile(path.join(root, ".env"), "utf8"),
      "LANGUAGE=pt-BR\n",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("offline setup fails with a useful message and preserves existing configuration", async () => {
  const root = await temporary();
  try {
    const original = "LANGUAGE=en-US\n";
    await fs.writeFile(path.join(root, ".env"), original);
    const replies = answers();
    replies.splice(1, 0, "1");
    await assert.rejects(
      runSetup(
        options(root, replies, {
          probe: async () => {
            throw new Error("offline");
          },
        }),
      ),
      /conexão/,
    );
    assert.equal(await fs.readFile(path.join(root, ".env"), "utf8"), original);
    assert.deepEqual(await fs.readdir(root), [".env"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing local coverage requires explicit acceptance; unavailable sources are not silently enabled", async () => {
  const root = await temporary();
  try {
    const replies = answers().concat("2");
    const result = await runSetup(
      options(root, replies, {
        probe: async (source) => {
          if (source.country === "US") throw new Error("blocked");
          return { items: 4, language: "pt" };
        },
      }),
    );
    assert.equal(result.cancelled, true);
    await assert.rejects(fs.access(path.join(root, ".env")));
    const accepted = await runSetup(
      options(root, answers().concat("1"), {
        probe: async (source) => {
          if (source.country === "US") throw new Error("blocked");
          return { items: 4, language: "pt" };
        },
      }),
    );
    assert.deepEqual(accepted.missingCountries, ["US"]);
    const sources = yaml(
      await fs.readFile(path.join(accepted.presetDir, "feeds.yml"), "utf8"),
    ).feeds;
    assert.equal(sources.length, 1);
    assert.equal(sources[0].country, "BR");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("closed input cannot silently save defaults and a missing PDF browser offers an explicit alternative", async () => {
  const root = await temporary();
  try {
    await assert.rejects(runSetup(options(root, [])), SetupCancelled);
    await assert.rejects(fs.access(path.join(root, ".env")));
    const replies = answers();
    replies[7] = "1";
    replies.splice(8, 0, "2");
    const result = await runSetup(
      options(root, replies, {
        browser: () => {
          throw new Error("no browser");
        },
      }),
    );
    assert.equal(result.cancelled, true);
    await assert.rejects(fs.access(path.join(root, ".env")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("source setup checks parse actual RSS and reject HTML and empty sources", async () => {
  const source = { name: "Local news", url: "https://example.org/rss" };
  const fetcher = async () =>
    new Response(
      '<rss version="2.0"><channel><title>News</title><link>https://example.org</link><description>News</description><language>en-US</language><item><title>Story</title><link>https://example.org/story</link></item></channel></rss>',
    );
  const result = await checkSetupSource(source, { fetcher });
  assert.equal(result.items, 1);
  assert.equal(result.language, "en-US");
  await assert.rejects(
    checkSetupSource(source, {
      fetcher: async () => new Response("<html>Blocked</html>"),
    }),
    /HTML/,
  );
});

test("English setup creates a US-only reading configuration through the same friendly flow", async () => {
  const root = await temporary();
  const io = options(root, ["2", "2", "2", "2", "1", "2", "1", "2", "1"]);
  try {
    const result = await runSetup(io);
    assert.equal(result.preferences.language, "en-US");
    assert.deepEqual(result.preferences.coverage, ["US"]);
    assert.ok(
      io.output.includes("Your preferences have been saved automatically"),
    );
    const sources = yaml(
      await fs.readFile(path.join(result.presetDir, "feeds.yml"), "utf8"),
    ).feeds;
    assert.deepEqual(
      sources.map((source) => source.country),
      ["US"],
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("another country is offered as the coverage default instead of silently falling back to Brazil", async () => {
  const root = await temporary();
  const ca = [{ ...catalog[1], name: "Canada News", country: "CA" }];
  try {
    const result = await runSetup(
      options(root, ["1", "1", "10", "Canadá", "", "1", "2", "1", "2", "1"], {
        catalog: ca,
      }),
    );
    assert.equal(result.preferences.residence, "CA");
    assert.deepEqual(result.preferences.coverage, ["CA"]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("personal subjects may be absent on a weak news day but an empty edition is always blocked", () => {
  const previous = categories.map((category) => category.required);
  try {
    for (const category of categories) category.required = false;
    const edition = {
      lead: {
        id: 1,
        category: categories[0].slug,
        headline: "Notícia disponível",
        summary: "Uma notícia relevante.",
        language: "pt-BR",
      },
      sections: [],
      sectionOrder: [],
      stats: {
        coverage: {
          missing: categories.slice(1).map((category) => ({
            ...category,
            reason: "no-candidate-after-analysis",
          })),
        },
      },
    };
    assert.equal(
      qualityGate.beforeRender({ edition }).edition.stats.qualityGate.passed,
      true,
    );
    assert.throws(
      () => qualityGate.beforeRender({ edition: { ...edition, lead: null } }),
      /No eligible stories/,
    );
  } finally {
    categories.forEach((category, index) => {
      if (previous[index] === undefined) delete category.required;
      else category.required = previous[index];
    });
  }
});

test("public setup CLI retains queued answers and exits cleanly on cancellation without writing files", async () => {
  const root = await temporary();
  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("../src/cli/setup.mjs", import.meta.url))],
        { cwd: root, stdio: ["pipe", "pipe", "pipe"] },
      );
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve(output) : reject(new Error(output)),
      );
      child.stdin.end("1\n1\n2\n1,2\n1,2\n2\n3\n2\n2\n");
    });
    assert.ok(output.includes("Configuração cancelada"));
    assert.deepEqual(await fs.readdir(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
