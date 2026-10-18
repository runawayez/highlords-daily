import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { config, feeds } from "../src/config.mjs";
import { fields } from "../src/config-options.mjs";
import { profileEnvironment } from "../src/engine/profile.mjs";
import {
  needsCopyLocalization,
  recoverLocalizedCopy,
} from "../src/services/localized-copy.mjs";
import { validateNewsletterContract } from "../src/editorial/edition.mjs";
import { validateSchema, itemsSchema } from "../src/services/ollama-client.mjs";
import { loadPlugins } from "../src/plugins.mjs";
import {
  fetchFeed,
  balancedLimit,
  resolveCandidateImages,
} from "../src/services/rss.mjs";
import { decodeFeed } from "../src/services/feed-cache.mjs";
import { recordPdfRecovery } from "../src/services/pdf-recovery.mjs";
import { requestItemReview } from "../src/services/editorial-review.mjs";
import { DiskCache, atomicWrite, readJson } from "../src/utils/storage.mjs";
import { sourceFingerprint } from "../src/engine/source-fingerprint.mjs";
import { dependencyState } from "../src/services/dependencies.mjs";
import { localOllama } from "../src/cli/launch.mjs";

const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), "highlords-audit-"));
const english = () => ({
  id: 1,
  language: "und",
  originalTitle: "The company has released its new processor",
  headline: "The company has released its new processor",
  excerpt:
    "The processor has been released with improved performance over the previous version.",
  summary:
    "The processor has been released with improved performance over the previous version.",
  tags: [],
});

test("unknown/mislabeled language and English headlines cannot bypass localization or the final contract", () => {
  for (const article of [
    english(),
    {
      ...english(),
      language: "en",
      summary: "A fabricante anunciou melhorias de desempenho.",
    },
    { ...english(), language: "pt-BR" },
  ]) {
    assert.equal(needsCopyLocalization(article, "pt-BR"), true);
    assert.ok(
      validateNewsletterContract({
        lead: article,
        sections: [],
        sectionOrder: [],
      }).errors.includes("unlocalized-copy:1"),
    );
  }
  assert.equal(
    needsCopyLocalization(
      {
        language: "und",
        headline: "GitHub Copilot no Visual Studio Code",
        summary: "A ferramenta recebeu melhorias para os desenvolvedores.",
      },
      "pt-BR",
    ),
    false,
  );
  assert.equal(
    needsCopyLocalization(
      {
        language: "und",
        headline: "東京の研究と新しい技術",
        summary: "日本で新しい科学研究が発表された。",
      },
      "pt-BR",
    ),
    true,
  );
});

test("localization retries a foreign headline even when the summary claims the right locale", async () => {
  let calls = 0;
  const input = english();
  const result = await recoverLocalizedCopy(input, {
    language: "pt-BR",
    cache: null,
    request: async () => {
      calls++;
      return {
        language: "pt-BR",
        headline:
          calls === 1
            ? input.headline
            : "Fabricante apresenta novo processador",
        summary:
          "O processador oferece melhorias de desempenho em relação à geração anterior.",
        tags: ["processadores"],
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.outputLanguage, "pt-BR");
});

test("publication profiles clear all policy and delivery inheritance and load only their own secrets", async () => {
  const directory = await temporary();
  try {
    const file = path.join(directory, "profile.yml");
    await fs.writeFile(
      file,
      "preset: br\ndataDir: state\noutputDir: editions\nsecretsFile: own.env\nmaxItemsPerSource: 2\npublicationLogo: own.svg\n",
    );
    await fs.writeFile(
      path.join(directory, "own.env"),
      "TELEGRAM_CHAT_ID=own-channel\nTELEGRAM_BOT_TOKEN=own-token\nLANGUAGE=en\n",
    );
    const env = await profileEnvironment(file, {
      MAX_ITEMS_PER_SOURCE: "99",
      SOURCE_DIVERSITY_STRICT: "true",
      EDITORIAL_RANKING_BATCH_SIZE: "2",
      PUBLICATION_LOGO: "/foreign.svg",
      TELEGRAM_CHAT_ID: "foreign-channel",
      DISCORD_WEBHOOK_URL: "https://foreign.invalid",
      BROWSER_PATH: "/machine/chrome",
      PATH: "machine-path",
    });
    assert.equal(env.MAX_ITEMS_PER_SOURCE, "2");
    assert.equal(env.SOURCE_DIVERSITY_STRICT, undefined);
    assert.equal(env.EDITORIAL_RANKING_BATCH_SIZE, undefined);
    assert.equal(env.DISCORD_WEBHOOK_URL, undefined);
    assert.equal(env.TELEGRAM_CHAT_ID, "own-channel");
    assert.equal(env.LANGUAGE, undefined);
    assert.equal(env.PUBLICATION_LOGO, path.join(directory, "own.svg"));
    assert.equal(
      env.MEMORY_FILE,
      path.join(directory, "state", "highlords.sqlite"),
    );
    assert.equal(env.BROWSER_PATH, "/machine/chrome");
    assert.equal(env.PATH, "machine-path");
    assert.ok(
      fields.cacheMaxMb && fields.requiredPlugins && fields.maxItemsPerSource,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("configuration rejects nonexistent presets and invalid focus and derives memory from dataDir", async () => {
  const directory = await temporary();
  const command = (extra) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import {config} from './src/config.mjs'; console.log(config.memoryFile)",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, HIGHLORDS_PROFILE: "true", ...extra },
      },
    );
  try {
    const badPreset = command({ PRESET: "does-not-exist" });
    assert.notEqual(badPreset.status, 0);
    assert.match(badPreset.stderr, /Unknown preset/);
    const isolated = command({ DATA_DIR: directory, MEMORY_FILE: "" });
    assert.equal(isolated.status, 0);
    assert.equal(
      isolated.stdout.trim(),
      path.join(directory, "highlords.sqlite"),
    );
    const file = path.join(directory, "feeds.yml");
    await fs.writeFile(
      file,
      "feeds:\n  - name: Broken\n    url: https://example.org/rss\n    focus: [typo-category]\n",
    );
    assert.match(command({ FEEDS_FILE: file }).stderr, /Unknown focus/);
    assert.notEqual(command({ MAX_CANDIDATES: "NaN" }).status, 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("publisher groups are shared by desks from the same newsroom", () => {
  for (const prefix of ["Gazeta Esportiva", "Agência Brasil"])
    assert.equal(
      new Set(
        feeds
          .filter((feed) => feed.name.startsWith(prefix))
          .map((feed) => feed.publisherGroup),
      ).size,
      1,
    );
});

test("structured output rejects duplicate IDs, oversized arrays and empty constrained strings", () => {
  const schema = {
    type: "array",
    maxItems: 2,
    minItems: 1,
    uniqueItems: true,
    items: { type: "integer" },
  };
  assert.throws(() => validateSchema([1, 1], schema), /Duplicate/);
  assert.throws(() => validateSchema([1, 2, 3], schema), /length/);
  assert.throws(() => validateSchema([], schema), /length/);
  assert.throws(
    () => validateSchema("", { type: "string", minLength: 1 }),
    /length/,
  );
});

test("required plugins fail preflight when missing, disabled or unimportable", async () => {
  const directory = await temporary();
  const settings = {
    ...config,
    pluginsDir: directory,
    enabledPlugins: ["gate.plugin.mjs"],
    requiredPlugins: ["gate.plugin.mjs"],
  };
  try {
    await assert.rejects(loadPlugins({ settings }), /missing/);
    await assert.rejects(
      loadPlugins({ settings: { ...settings, pluginsEnabled: false } }),
      /cannot be disabled/,
    );
    await fs.writeFile(
      path.join(directory, "gate.plugin.mjs"),
      "throw new Error('broken import');",
    );
    await assert.rejects(loadPlugins({ settings }), /Required plugin failed/);
    await assert.rejects(
      loadPlugins({ settings: { ...settings, enabledPlugins: [] } }),
      /not enabled/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("RSS filters invalid dates and sorts before limiting, even when recent items follow pinned items", async () => {
  const previous = config.maxItemsPerFeed;
  config.maxItemsPerFeed = 3;
  const now = new Date("2026-10-18T12:00:00Z");
  const item = (id, date) =>
    `<item><title>Research ${id}</title><link>https://example.org/${id}</link><guid>${id}</guid>${date ? `<pubDate>${date}</pubDate>` : ""}<description>A source report.</description></item>`;
  const xml = `<rss version="2.0"><channel><title>Source</title><link>https://example.org</link><description>News</description>${item("old", "2020-01-01")}${item("missing")}${item("invalid", "bad-date")}${item("future", "2030-01-01")}${[1, 2, 3, 4].map((id) => item(id, `2026-10-18T0${id}:00:00Z`)).join("")}</channel></rss>`;
  try {
    const result = await fetchFeed(
      {
        name: "Source",
        url: "https://example.org/rss",
        focus: [],
        imageMode: "off",
      },
      { xml, now },
    );
    assert.deepEqual(
      result.map((article) => article.originalTitle),
      ["Research 4", "Research 3", "Research 2"],
    );
    assert.ok(result.every((article) => article.dateQuality === "provided"));
  } finally {
    config.maxItemsPerFeed = previous;
  }
});

test("feed responses distinguish HTML/empty bodies and decode legacy RSS encodings", () => {
  assert.throws(
    () => decodeFeed(Buffer.from("<!doctype html><html>Blocked</html>")),
    /HTML page/,
  );
  assert.throws(() => decodeFeed(Buffer.alloc(0)), /empty/);
  const xml = decodeFeed(
    Buffer.from(
      "<rss><channel><title>Notícias</title></channel></rss>",
      "latin1",
    ),
    "text/xml; charset=iso-8859-1",
  );
  assert.ok(xml.includes("Notícias"));
  assert.ok(xml.includes('rss version="2.0"'));
});

const candidate = (id, source = "Source") => ({
  id,
  stableId: String(id),
  link: `https://example.org/${id}`,
  source,
  publisherGroup: source,
  imageMode: "auto",
  focus: [],
  publishedAt: "2026-10-18T10:00:00Z",
});
test("image discovery stops at the candidate limit and backfills failed probes", async () => {
  let calls = 0;
  const input = [1, 2, 3, 4, 5, 6].map((id) => candidate(id));
  const result = await resolveCandidateImages(input, [], {
    limit: 2,
    concurrency: 2,
    requireImages: true,
    resolve: async (article) => {
      calls++;
      return article.id === 1
        ? null
        : `https://images.example.org/${article.id}.jpg`;
    },
  });
  assert.equal(calls, 3);
  assert.equal(result.imageRejected, 1);
  assert.deepEqual(
    result.articles.map((article) => article.id),
    [2, 3],
  );
});

test("candidate quotas do not multiply a publisher's opportunities across its desks", () => {
  const input = [1, 2, 3, 4].map((id) => ({
    ...candidate(id, `Desk ${id}`),
    publisherGroup: "One newsroom",
  }));
  input.push(candidate(5, "Other newsroom"));
  assert.deepEqual(
    new Set(
      balancedLimit(input, [], 2).map((article) => article.publisherGroup),
    ),
    new Set(["One newsroom", "Other newsroom"]),
  );
});

test("editorial review cache survives ID reassignment but invalidates changed input and prompts", async () => {
  const directory = await temporary();
  const cache = new DiskCache(directory);
  const schema = itemsSchema({
    id: { type: "integer" },
    category: { type: "string" },
    confidence: { type: "number" },
  });
  let calls = 0;
  const request = async (_system, user) => {
    calls++;
    return {
      items: JSON.parse(user).map((item) => ({
        id: item.id,
        category: "science",
        confidence: 0.9,
      })),
    };
  };
  const options = { namespace: "review", schema, cache, request };
  try {
    await requestItemReview("prompt-v1", [{ id: 1, title: "News" }], options);
    const reused = await requestItemReview(
      "prompt-v1",
      [{ id: 9, title: "News" }],
      options,
    );
    assert.equal(reused[0].id, 9);
    assert.equal(calls, 1);
    await requestItemReview("prompt-v2", [{ id: 9, title: "News" }], options);
    await requestItemReview(
      "prompt-v2",
      [{ id: 9, title: "Changed" }],
      options,
    );
    assert.equal(calls, 3);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("PDF recovery reconciles run, status, latest JSON and report without changing story text", async () => {
  const directory = await temporary();
  const settings = {
    dataDir: path.join(directory, "data"),
    outputDir: path.join(directory, "output"),
  };
  const date = "2026-10-18",
    slug = "daily";
  const editionDir = path.join(settings.outputDir, date),
    runDir = path.join(settings.dataDir, "runs", date);
  const write = (file, value) => atomicWrite(file, JSON.stringify(value));
  try {
    await write(path.join(runDir, "run.json"), {
      status: "completed",
      pdfError: "old browser error",
    });
    await write(path.join(settings.outputDir, "status.json"), {
      status: "pdf-pending",
      editionDate: date,
      error: "old browser error",
    });
    const edition = {
      editionDate: date,
      title: "Unchanged title",
      lead: { headline: "Unchanged story" },
      stats: {},
    };
    await write(path.join(editionDir, "edition.json"), edition);
    await write(path.join(settings.outputDir, "latest.json"), edition);
    await write(path.join(editionDir, "editorial-report.json"), {
      editionDate: date,
      status: "completed-pdf-pending",
      error: "old browser error",
      decisions: [],
    });
    await atomicWrite(
      path.join(editionDir, `${slug}-${date}.pdf`),
      Buffer.from("fixture-pdf"),
    );
    await recordPdfRecovery(date, settings, { slug }, { pages: 2, issues: [] });
    assert.equal(
      (await readJson(path.join(runDir, "run.json"))).pdfError,
      null,
    );
    assert.equal(
      (await readJson(path.join(settings.outputDir, "status.json"))).status,
      "completed",
    );
    assert.equal(
      (await readJson(path.join(editionDir, "editorial-report.json"))).error,
      null,
    );
    const latest = await readJson(path.join(settings.outputDir, "latest.json"));
    assert.deepEqual(latest.lead, edition.lead);
    assert.equal(latest.stats.pdfLayout.pages, 2);
    // Repairing an old PDF must not overwrite today's operational status.
    await write(path.join(settings.outputDir, "status.json"), {
      editionDate: "2026-10-19",
      status: "failed",
    });
    await recordPdfRecovery(date, settings, { slug });
    assert.equal(
      (await readJson(path.join(settings.outputDir, "status.json"))).status,
      "failed",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("checkpoints invalidate after source/plugin edits and dependency markers invalidate on lockfile changes", async () => {
  const directory = await temporary();
  try {
    await fs.mkdir(path.join(directory, "node_modules"));
    await fs.writeFile(
      path.join(directory, "package.json"),
      '{"dependencies":{}}',
    );
    await fs.writeFile(path.join(directory, "package-lock.json"), "v1");
    await fs.writeFile(path.join(directory, "plugin.mjs"), "export default 1;");
    const before = sourceFingerprint([directory]);
    const state = await dependencyState(directory);
    assert.equal(state.current, false);
    await fs.writeFile(state.marker, state.fingerprint);
    assert.equal((await dependencyState(directory)).current, true);
    await fs.writeFile(path.join(directory, "plugin.mjs"), "export default 2;");
    assert.notEqual(sourceFingerprint([directory]), before);
    await fs.writeFile(path.join(directory, "package-lock.json"), "v2");
    assert.equal((await dependencyState(directory)).current, false);
    assert.equal(localOllama("http://127.0.0.1:11434"), true);
    assert.equal(localOllama("https://remote.example.org"), false);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
