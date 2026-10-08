import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stringify as yaml } from "yaml";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function command(args, env = {}) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...env },
    });
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(output)),
    );
  });
}

test(
  "full CLI generates an Arabic edition from Japanese RSS with custom taxonomy, caches and idempotency",
  { timeout: 30000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "highlords-integration-"),
    );
    const calls = { feeds: 0, images: 0, chat: 0, tags: 0 };
    let origin;
    const server = http.createServer(async (request, response) => {
      if (request.url === "/rss") {
        calls.feeds++;
        if (request.headers["if-none-match"] === '"v1"') {
          response.writeHead(304);
          response.end();
          return;
        }
        response.setHeader("etag", '"v1"');
        response.setHeader("content-type", "application/rss+xml");
        response.end(
          `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Japan</title><language>ja-JP</language><link>${origin}</link><description>Test</description>${[1, 2, 3].map((id) => `<item><title>${id === 1 ? "東京の科学研究" : id === 2 ? "地域の公共交通" : "新しい宇宙探査"} ${id}</title><link>${origin}/article/${id}</link><guid>${id}</guid><pubDate>${new Date().toUTCString()}</pubDate><description>研究と地域ニュース</description><enclosure url="${origin}/photo-${id}.png" type="image/png" /></item>`).join("")}</channel></rss>`,
        );
        return;
      }
      if (request.url.startsWith("/article/")) {
        response.setHeader("content-type", "text/html");
        response.end(
          `<html><head><meta property="og:image" content="${origin}/photo-${request.url.split("/").at(-1)}.png"></head></html>`,
        );
        return;
      }
      if (request.url.startsWith("/photo-")) {
        calls.images++;
        const buffer = Buffer.alloc(20000, 73);
        buffer.set([137, 80, 78, 71, 13, 10, 26, 10]);
        buffer.writeUInt32BE(800, 16);
        buffer.writeUInt32BE(400, 20);
        response.setHeader("content-type", "image/png");
        response.setHeader("content-length", buffer.length);
        response.end(buffer);
        return;
      }
      if (request.url === "/api/tags") {
        calls.tags++;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ models: [{ name: "qwen3:4b" }] }));
        return;
      }
      if (request.url === "/api/chat") {
        calls.chat++;
        let body = "";
        for await (const chunk of request) body += chunk;
        const query = JSON.parse(body);
        assert.equal(query.keep_alive, "10m");
        assert.equal(typeof query.format, "object");
        const properties = query.format.properties;
        let result;
        if (properties.items) {
          const rows = JSON.parse(query.messages[1].content);
          const fields = properties.items.items.properties;
          if (fields.category)
            result = {
              items: rows.map((row, index) => ({
                id: row.id,
                category: index === 1 ? "local" : "science",
                score: 7 + index / 10,
                topicKey: `story-${index}`,
                headline: `خبر علمي ${index}`,
                summary: `ملخص الخبر ${index}`,
                tags: ["العلم"],
              })),
            };
          else if (fields.impact)
            result = {
              items: rows.map((row) => ({
                id: row.id,
                impact: 7,
                significance: 6,
                publicInterest: 7,
                novelty: 7,
                utility: 6,
                editorialValue: 7,
                promotionalLevel: 0,
              })),
            };
          else
            result = {
              items: rows.map((row) => ({
                id: row.id,
                frontPagePriority: 7,
                sectionPriority: 7,
              })),
            };
        } else if (properties.topStoryIds)
          result = {
            intro:
              "تتصدر الأبحاث العلمية والاستكشافات الجديدة أخبار اليوم، إلى جانب تطورات النقل المحلي في اليابان.",
            topStoryIds: [3, 2],
          };
        else
          result = {
            title: "أخبار اليوم",
            intro: "أخبار من اليابان",
            leadId: 1,
            sectionTitles: { science: "العلم", local: "محلي" },
            sections: { science: [3], local: [2] },
          };
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            message: { content: JSON.stringify(result) },
            total_duration: 100,
            load_duration: 10,
            prompt_eval_count: 20,
            eval_count: 30,
            eval_duration: 50,
          }),
        );
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    const profile = path.join(directory, "profile.yml");
    try {
      await fs.writeFile(
        path.join(directory, "categories.yml"),
        yaml({
          categories: [
            {
              slug: "science",
              name: "Science",
              labels: { ar: "العلم" },
              description: "Research",
            },
            {
              slug: "local",
              name: "Local",
              labels: { ar: "محلي" },
              description: "Local events",
            },
          ],
        }),
      );
      await fs.writeFile(
        path.join(directory, "feeds.yml"),
        yaml({
          feeds: [
            {
              name: "Japanese Source",
              url: `${origin}/rss`,
              language: "ja-JP",
              country: "JP",
              coverage: ["JP"],
              publisher_group: "Example News",
              focus: [],
            },
          ],
        }),
      );
      await fs.writeFile(
        profile,
        yaml({
          preset: "global",
          language: "ar-EG",
          region: "JP",
          coverage: ["JP"],
          sourceLanguages: ["ja"],
          timeZone: "Asia/Tokyo",
          editorialContext: "Japan",
          categoriesFile: "categories.yml",
          feedsFile: "feeds.yml",
          dataDir: "data",
          outputDir: "output",
          ollamaHost: origin,
          exportPdf: false,
          autoOpen: false,
          enabledPlugins: ["editorial-ranking.plugin.mjs"],
        }),
      );
      const args = [
        "src/cli/run.mjs",
        "daily",
        "--config",
        profile,
        "--unattended",
        "--date",
        "2026-10-07",
      ];
      await command(args);
      const editionDir = path.join(directory, "output", "2026-10-07");
      const edition = JSON.parse(
        await fs.readFile(path.join(editionDir, "edition.json"), "utf8"),
      );
      assert.equal(edition.language, "ar-EG");
      assert.equal(edition.stats.stories, 3);
      assert.equal(edition.frontPageTitle, "ما يستحق اهتمامك اليوم");
      assert.equal(edition.topStories.length, 2);
      assert.ok(edition.lead.stableId);
      assert.equal(edition.lead.language, "ja-JP");
      const html = await fs.readFile(
        path.join(editionDir, "index.html"),
        "utf8",
      );
      assert.ok(html.includes('dir="rtl"'));
      assert.ok(html.includes("اقرأ الخبر"));
      assert.ok(
        !html.includes(
          "تتصدر الأبحاث العلمية والاستكشافات الجديدة أخبار اليوم",
        ),
      );
      assert.ok(html.includes("ما يستحق اهتمامك اليوم"));
      assert.ok(!html.includes("<h1>"));
      // Highlights reference stories that remain in their categories, so the
      // three unique published stories all get their normal section image asset.
      assert.equal(
        (await fs.readdir(path.join(editionDir, "assets"))).length,
        3,
      );
      const metrics = JSON.parse(
        await fs.readFile(
          path.join(directory, "data", "runs", "2026-10-07", "metrics.json"),
          "utf8",
        ),
      );
      assert.ok(metrics.counters.llmCalls >= 4);
      assert.ok(metrics.stages.analysis >= 0);
      const before = { ...calls };
      await command(args);
      assert.deepEqual(calls, before);
      // Force with history disabled: cached analysis is reused; ranking, curation and highlights still run.
      await fs.writeFile(
        profile,
        (await fs.readFile(profile, "utf8")) + "historyEnabled: false\n",
      );
      const output = await command([...args, "--force"]);
      assert.ok(output.includes("Ready"));
      assert.equal(calls.feeds, before.feeds + 1);
      assert.equal(calls.images, before.images);
      assert.equal(calls.chat, before.chat + 3);
      const updated = JSON.parse(
        await fs.readFile(
          path.join(directory, "data", "runs", "2026-10-07", "metrics.json"),
          "utf8",
        ),
      );
      assert.equal(updated.counters.feedCacheHits, 1);
      assert.equal(updated.counters.analysisCacheHits, 3);
      assert.equal(updated.counters.dimensionCacheHits, 3);
      assert.equal(updated.counters.imageFileCacheHits, 3);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
