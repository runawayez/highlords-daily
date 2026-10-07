import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  normalizeText,
  wordTokens,
  textDirection,
} from "../src/utils/text.mjs";
import { mapLimit, limiter } from "../src/utils/concurrency.mjs";
import { DiskCache, atomicWrite, readJson } from "../src/utils/storage.mjs";
import {
  acquireLock,
  RunState,
  editionDate,
  validateDate,
} from "../src/engine/run-state.mjs";
import { runPipeline } from "../src/engine/pipeline.mjs";
import { profileEnvironment } from "../src/engine/profile.mjs";
import { isDue, schedulePlan } from "../src/engine/scheduler.mjs";
import { uiCatalog, validateCatalog } from "../src/services/i18n.mjs";
import {
  articleSimilarity,
  storyFingerprint,
} from "../src/services/memory.mjs";
import { deliverEdition } from "../src/services/delivery.mjs";
import { config } from "../src/config.mjs";
import { researchSites } from "../src/sources/research.mjs";
const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), "highlords-engine-"));

test("Unicode titles survive normalization and segmentation across scripts", () => {
  for (const [locale, title] of [
    ["ja", "東京の科学研究"],
    ["ar", "اكتشاف علمي جديد"],
    ["zh", "科学研究突破"],
    ["ko", "새로운 과학 연구"],
  ]) {
    assert.ok(normalizeText(title).length > 0);
    assert.ok(wordTokens(title, locale).length > 0);
    assert.ok(storyFingerprint({ originalTitle: title }).length > 0);
    assert.equal(
      articleSimilarity({ originalTitle: title }, { originalTitle: title }),
      1,
    );
  }
  assert.equal(
    articleSimilarity(
      { originalTitle: "東京の科学研究" },
      { originalTitle: "مباراة كرة القدم" },
    ),
    0,
  );
  assert.equal(textDirection("ar-EG"), "rtl");
  assert.equal(textDirection("ja-JP"), "ltr");
});

test("concurrency stays bounded while preserving source order", async () => {
  let active = 0,
    peak = 0;
  const result = await mapLimit([35, 5, 20, 1], 2, async (delay, index) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active--;
    return index;
  });
  assert.deepEqual(result, [0, 1, 2, 3]);
  assert.equal(peak, 2);
});

test("limiter releases capacity after task failure", async () => {
  const limit = limiter(1);
  const results = await Promise.allSettled([
    limit(() => {
      throw new Error("fail");
    }),
    limit(() => 42),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].value, 42);
});

test("persistent cache handles corruption, TTL and concurrent requests", async () => {
  const directory = await temporary();
  const cache = new DiskCache(directory);
  let calls = 0;
  try {
    const action = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { title: "東京" };
    };
    assert.deepEqual(
      await Promise.all([
        cache.remember("test", "key", action, 1000),
        cache.remember("test", "key", action, 1000),
      ]),
      [{ title: "東京" }, { title: "東京" }],
    );
    assert.equal(calls, 1);
    await cache.set("test", "expired", 1, -1);
    assert.equal(await cache.get("test", "expired"), null);
    assert.equal(await cache.get("test", "expired", { stale: true }), 1);
    await fs.writeFile(cache.file("test", "broken"), "{broken");
    assert.equal(await cache.get("test", "broken"), null);
    await cache.prune();
    await assert.rejects(fs.access(cache.file("test", "expired")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("live publication locks cannot be stolen and release is reusable", async () => {
  const directory = await temporary();
  const file = path.join(directory, "lock");
  try {
    const release = await acquireLock(file);
    await assert.rejects(acquireLock(file), /already running/);
    await release();
    await (
      await acquireLock(file)
    )();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("run checkpoints reuse successful stages after failure and invalidate on config change", async () => {
  const directory = await temporary();
  let calls = 0;
  try {
    const first = await new RunState(directory, "v1").init();
    await first.stage("analysis", async () => {
      calls++;
      return [{ id: 1 }];
    });
    const resumed = await new RunState(directory, "v1").init();
    assert.deepEqual(
      await resumed.stage("analysis", async () => {
        throw new Error("must not run");
      }),
      [{ id: 1 }],
    );
    const changed = await new RunState(directory, "v2").init();
    await changed.stage("analysis", async () => {
      calls++;
      return [];
    });
    assert.equal(calls, 2);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("edition day and schedule use editorial timezone, including UTC+14", () => {
  const instant = new Date("2026-10-07T15:00:00Z");
  assert.equal(editionDate("Pacific/Kiritimati", instant), "2026-10-08");
  assert.equal(
    isDue(new Date("2026-10-07T10:00:00Z"), "America/Sao_Paulo", "07:00"),
    true,
  );
  assert.equal(
    isDue(new Date("2026-10-07T09:59:00Z"), "America/Sao_Paulo", "07:00"),
    false,
  );
  assert.throws(() => validateDate("2026-02-30"));
  assert.throws(() => isDue(instant, "UTC", "25:00"));
});

test("scheduler plans are noninteractive and safely quote spaces and markup", () => {
  const options = {
    root: "/tmp/a & b",
    node: "/usr/bin/node",
    dataDir: "/tmp/data space",
    profileFile: "/tmp/a & b/profile.yml",
  };
  const windows = schedulePlan({ ...options, platform: "win32" });
  assert.ok(windows.command[1].includes("/MO"));
  assert.ok(windows.files[0].content.includes("run.mjs"));
  assert.ok(!windows.files[0].content.includes("pause"));
  const mac = schedulePlan({ ...options, platform: "darwin" });
  assert.ok(mac.files[0].content.includes("a &amp; b"));
  assert.ok(mac.files[0].content.includes("<key>RunAtLoad</key>"));
  const linux = schedulePlan({
    ...options,
    platform: "linux",
    backend: "systemd",
  });
  assert.ok(linux.files[1].content.includes("Persistent=true"));
  assert.ok(linux.files[0].content.includes('"/tmp/a & b"'));
  const cron = schedulePlan({ ...options, platform: "linux", backend: "cron" });
  assert.ok(cron.line.startsWith("*/5"));
  assert.ok(cron.line.includes("--config"));
  assert.ok(cron.line.includes("a & b"));
});

test("publication profile isolates state from inherited env and rejects unknown settings", async () => {
  const directory = await temporary();
  const file = path.join(directory, "profile.yml");
  try {
    await fs.writeFile(
      file,
      "language: ja-JP\nregion: BR\nsourceLanguages: [pt, en]\ndataDir: ./state\noutputDir: ./editions\n",
    );
    const env = await profileEnvironment(file, {
      MEMORY_FILE: "/wrong/history",
      CACHE_DIR: "/wrong/cache",
    });
    assert.equal(env.LANGUAGE, "ja-JP");
    assert.equal(env.REGION, "BR");
    assert.equal(
      env.MEMORY_FILE,
      path.join(directory, "state", "highlords.sqlite"),
    );
    assert.equal(env.SOURCE_LANGUAGES, "pt,en");
    assert.equal(env.OUTPUT_DIR, path.join(directory, "editions"));
    await fs.appendFile(file, "unknown: true\n");
    await assert.rejects(profileEnvironment(file), /Unknown/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("bundled UI catalogs are complete and deterministic", () => {
  for (const language of [
    "pt-BR",
    "en-US",
    "es-ES",
    "fr-FR",
    "de-DE",
    "ja-JP",
    "zh-CN",
    "ar-EG",
  ])
    assert.deepEqual(
      validateCatalog(uiCatalog(language, null)),
      uiCatalog(language, null),
    );
  assert.equal(uiCatalog("ja-JP", null).readArticle, "記事を読む");
  assert.throws(() => validateCatalog({}), /incomplete/);
});

test("pipeline preserves HTML on PDF failure and does not repeat completed generation", async () => {
  const directory = await temporary();
  let collected = 0,
    remembered = 0;
  const context = {
    config: {
      dataDir: path.join(directory, "data"),
      outputDir: path.join(directory, "output"),
      exportPdf: true,
    },
    publication: { slug: "test" },
    editionDate: "2026-10-07",
    fingerprint: "v1",
    options: {},
    reserveCandidates: [],
  };
  const services = {
    preflight: async () => {},
    collect: async () => {
      collected++;
      return { articles: [{ id: 1 }], errors: [] };
    },
    analyze: async (a) => a,
    rank: async (a) => a,
    select: async () => ({
      editionDate: context.editionDate,
      title: "test",
      stats: {},
      sections: [],
      lead: { id: 1 },
    }),
    images: async (e) => e,
    html: async () => "<html>complete</html>",
    exports: async () => {},
    pdf: async () => {
      throw new Error("No browser");
    },
    publish: async () => {},
    remember: async () => {
      remembered++;
    },
    afterWrite: async () => {},
  };
  try {
    const first = await runPipeline(context, services);
    assert.equal(first.pdfError, "No browser");
    assert.equal(
      await fs.readFile(path.join(first.editionDir, "index.html"), "utf8"),
      "<html>complete</html>",
    );
    const second = await runPipeline({ ...context }, services);
    assert.equal(second.alreadyCompleted, true);
    assert.equal(collected, 1);
    assert.equal(remembered, 1);
    const metrics = await readJson(
      path.join(directory, "data", "runs", "2026-10-07", "metrics.json"),
    );
    assert.ok(metrics.totalMs >= 0);
    await assert.rejects(
      fs.access(path.join(directory, "data", "publication.lock")),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("pipeline retries failed later stages without repeating collection or inference", async () => {
  const directory = await temporary();
  let analysis = 0,
    attempts = 0;
  const ctx = {
    config: {
      dataDir: path.join(directory, "data"),
      outputDir: path.join(directory, "output"),
      exportPdf: false,
    },
    publication: { slug: "test" },
    editionDate: "2026-10-07",
    fingerprint: "same",
    options: {},
  };
  const services = {
    preflight: async () => {},
    collect: async () => ({ articles: [{ id: 1 }] }),
    analyze: async (a) => {
      analysis++;
      return a;
    },
    rank: async (a) => a,
    select: async () => ({
      editionDate: ctx.editionDate,
      title: "x",
      stats: {},
      sections: [],
    }),
    images: async (e) => {
      if (attempts++ === 0) throw new Error("temporary");
      return e;
    },
    html: async () => "<html/>",
    exports: async () => {},
    publish: async () => {},
    remember: async () => {},
    afterWrite: async () => {},
  };
  try {
    await assert.rejects(runPipeline({ ...ctx }, services), /temporary/);
    await runPipeline({ ...ctx }, services);
    assert.equal(analysis, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("delivery records success once and leaves ambiguous network failures for inspection", async () => {
  const directory = await temporary();
  const previous = config.dataDir;
  config.dataDir = directory;
  let calls = 0;
  const env = {
    DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/test/secret",
  };
  const edition = { editionDate: "2026-10-07", title: "test" };
  try {
    await fs.writeFile(path.join(directory, "discord.md"), "hello");
    const fetcher = async () => {
      calls++;
      return new Response("{}", { status: 200 });
    };
    await deliverEdition(edition, directory, { env, fetcher });
    await deliverEdition(edition, directory, { env, fetcher });
    assert.equal(calls, 1);
    await fs.writeFile(path.join(directory, "discord.md"), "different");
    await assert.rejects(
      deliverEdition(edition, directory, {
        env,
        fetcher: async () => {
          calls++;
          throw new Error("https://secret");
        },
      }),
      /unknown/,
    );
    await assert.rejects(
      deliverEdition(edition, directory, { env, fetcher }),
      /uncertain/,
    );
    assert.equal(calls, 2);
    const outbox = await fs.readFile(
      path.join(directory, "outbox", "2026-10-07.json"),
      "utf8",
    );
    assert.ok(!outbox.includes("secret"));
    assert.ok(!outbox.includes("discord.com"));
  } finally {
    config.dataDir = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("source directory research returns candidates with provenance and excludes social sites", async () => {
  let calls = 0;
  const fetcher = async () =>
    new Response(
      JSON.stringify(
        ++calls === 1
          ? { query: { search: [{ pageid: 1 }] } }
          : {
              query: {
                pages: {
                  1: {
                    pageid: 1,
                    title: "Example News",
                    extlinks: [
                      { "*": "https://example.org/" },
                      { "*": "https://facebook.com/" },
                      { "*": "https://example.net/article" },
                    ],
                  },
                },
              },
            },
      ),
      { headers: { "content-type": "application/json" } },
    );
  const result = await researchSites({ region: "Japan", fetcher });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, "candidate");
  assert.ok(result[0].provenance.includes("pageid=1"));
});

test("SMTP delivery is explicit, supports isolated retries and uses a stable message id", async () => {
  const directory = await temporary();
  const previous = config.dataDir;
  config.dataDir = directory;
  let calls = 0,
    messageId;
  try {
    await fs.writeFile(path.join(directory, "email.html"), "<p>Edition</p>");
    const options = {
      env: {
        SMTP_HOST: "smtp.example.org",
        EMAIL_FROM: "daily@example.org",
        EMAIL_TO: "reader@example.org",
      },
      smtpSender: async (message, key) => {
        calls++;
        messageId = key;
        assert.equal(message.to[0], "reader@example.org");
      },
    };
    const edition = { editionDate: "2026-10-07", title: "Daily" };
    await deliverEdition(edition, directory, options);
    await deliverEdition(edition, directory, options);
    assert.equal(calls, 1);
    assert.equal(messageId.length, 64);
    const { smtpOptions } = await import("../src/services/smtp.mjs");
    assert.equal(
      smtpOptions({ SMTP_HOST: "example.org", SMTP_PORT: "465" }).secure,
      true,
    );
    assert.equal(
      smtpOptions({ SMTP_HOST: "example.org", SMTP_PORT: "587" }).requireTLS,
      true,
    );
  } finally {
    config.dataDir = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("structured output validation rejects bad category, missing fields and out of range score", async () => {
  const { validateSchema, itemsSchema } =
    await import("../src/services/ollama-client.mjs");
  const schema = itemsSchema({
    id: { type: "integer" },
    category: { type: ["string", "null"], enum: ["science", null] },
    score: { type: "number", minimum: 0, maximum: 10 },
  });
  assert.throws(
    () =>
      validateSchema(
        { items: [{ id: 1, category: "unknown", score: 7 }] },
        schema,
      ),
    /enum/,
  );
  assert.throws(
    () =>
      validateSchema(
        { items: [{ id: 1, category: "science", score: 11 }] },
        schema,
      ),
    /score/,
  );
  assert.throws(
    () => validateSchema({ items: [{ id: 1, category: "science" }] }, schema),
    /Missing/,
  );
});
