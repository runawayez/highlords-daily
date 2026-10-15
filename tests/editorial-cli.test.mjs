import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { updateArchive } from "../src/services/archive.mjs";

const dataset = JSON.parse(
  await fs.readFile(
    new URL("./fixtures/editorial.json", import.meta.url),
    "utf8",
  ),
);
const root = new URL("../", import.meta.url);
function command(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, ...env },
    });
    let output = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(output)),
    );
  });
}

test(
  "live evaluation exercises real adapters with a fixture Ollama and never leaks expected labels",
  { timeout: 30000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "highlords-eval-cli-"),
    );
    let calls = 0;
    const server = http.createServer(async (request, response) => {
      try {
        response.setHeader("content-type", "application/json");
        if (request.url === "/api/tags")
          return response.end(
            JSON.stringify({ models: [{ name: "qwen3:4b" }] }),
          );
        assert.equal(request.url, "/api/chat");
        let raw = "";
        for await (const chunk of request) raw += chunk;
        const query = JSON.parse(raw);
        assert.ok(!query.messages[1].content.includes("expectedCategory"));
        assert.ok(!query.messages[1].content.includes("expectedEligible"));
        assert.ok(!query.messages[1].content.includes("referenceScore"));
        calls++;
        const props = query.format?.properties;
        let result;
        let input;
        try {
          input = JSON.parse(query.messages[1].content);
        } catch {}
        const sampleFor = (row) =>
          dataset.articles.find(
            (sample) => sample.originalTitle === (row.title || row.headline),
          ) || dataset.articles.find((sample) => sample.id === row.id);
        if (props?.items) {
          const fields = props.items.items.properties;
          if (fields.action)
            result = {
              items: input.map((row) => ({
                id: row.id,
                action: "keep",
                category: row.currentCategory,
                confidence: 0.99,
                reason: "Fixture semantic review",
              })),
            };
          else if (fields.category)
            result = {
              items: input.map((row) => {
                const sample = sampleFor(row);
                return {
                  id: row.id,
                  category: sample.expectedCategory,
                  score: sample.referenceScore,
                  topicKey: sample.stableId,
                  headline: sample.originalTitle,
                  summary: sample.excerpt,
                  tags: [],
                };
              }),
            };
          else if (fields.impact)
            result = {
              items: input.map((row) => {
                const score = sampleFor(row).referenceScore;
                return {
                  id: row.id,
                  impact: score,
                  significance: score,
                  publicInterest: score,
                  novelty: score,
                  utility: score,
                  editorialValue: score,
                  promotionalLevel: score === 3 ? 10 : 0,
                };
              }),
            };
          else
            result = {
              items: input.map((row) => ({
                id: row.id,
                frontPagePriority: sampleFor(row).referenceScore,
                sectionPriority: sampleFor(row).referenceScore,
              })),
            };
        } else if (props?.topStoryIds)
          result = {
            intro:
              "Juros e risco de enchentes estão entre os principais acontecimentos do dia. Pesquisa e serviços também tiveram novidades relevantes.",
            topStoryIds: input.candidates.slice(0, 3).map((row) => row.id),
          };
        else if (props?.leadId) {
          const keys = Object.keys(props.sections.properties);
          result = {
            title: "Edição de teste",
            intro: "Juros e clima exigem atenção dos leitores.",
            leadId: 4,
            sectionTitles: Object.fromEntries(keys.map((key) => [key, key])),
            sections: Object.fromEntries(
              keys.map((key) => [
                key,
                dataset.articles
                  .filter(
                    (article) =>
                      article.expectedCategory === key && article.id !== 4,
                  )
                  .map((article) => article.id),
              ]),
            ),
          };
        } else if (props?.sections)
          result = {
            sections: input.sections.map((section) => ({
              slug: section.slug,
              layout: "balanced",
              articleIds: section.stories.map((story) => story.id),
              featureId: null,
            })),
          };
        else if (query.format === "json") {
          // Ranking dimensions/global calibration use their legacy JSON adapter.
          const dimensions = query.messages[0].content.includes('"impact"');
          result = {
            items: input.map((row) => {
              const score = sampleFor(row).referenceScore;
              return dimensions
                ? {
                    id: row.id,
                    impact: score,
                    significance: score,
                    publicInterest: score,
                    novelty: score,
                    utility: score,
                    editorialValue: score,
                    promotionalLevel: score === 3 ? 10 : 0,
                  }
                : {
                    id: row.id,
                    frontPagePriority: score,
                    sectionPriority: score,
                  };
            }),
          };
        } else
          result = {
            intro:
              "Juros e clima exigem atenção dos leitores. Pesquisa e serviços tiveram novidades.",
          };
        response.end(
          JSON.stringify({
            message: { content: JSON.stringify(result) },
            eval_count: 10,
          }),
        );
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: error.message }));
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const output = path.join(directory, "evaluation.json");
    try {
      await command(
        ["scripts/editorial-evaluate.mjs", "--live", "--output", output],
        {
          PRESET: "br",
          OLLAMA_HOST: `http://127.0.0.1:${server.address().port}`,
        },
      );
      const report = JSON.parse(await fs.readFile(output, "utf8"));
      assert.equal(report.success, true);
      assert.equal(report.modelEvaluation, "evaluated");
      assert.ok(calls >= 5);
      assert.equal(report.benchmark.kind, "fixed-candidates-real-ollama");
      assert.ok(report.benchmark.metrics.counters.llmCalls >= 5);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);

test("archive embeds searchable source data without script injection and identifies a failed generation", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "highlords-archive-search-"),
  );
  const malicious = "</script><script>globalThis.injected=true</script>";
  try {
    const folder = path.join(directory, "2026-10-14");
    await fs.mkdir(folder);
    await fs.writeFile(
      path.join(folder, "edition.json"),
      JSON.stringify({
        editionDate: "2026-10-14",
        title: "Last valid",
        lead: {
          id: "a",
          headline: malicious,
          summary: "Uma matéria",
          category: "games",
          source: "Fonte",
          link: "javascript:bad",
        },
        sections: [],
      }),
    );
    await fs.writeFile(
      path.join(directory, "status.json"),
      JSON.stringify({
        status: "failed",
        editionDate: "2026-10-15",
        error: "Missing core category",
      }),
    );
    const file = await updateArchive(directory);
    const html = await fs.readFile(file, "utf8");
    assert.ok(!html.includes(malicious));
    const data = JSON.parse(
      html.match(
        /<script id="archive-data" type="application\/json">([\s\S]*?)<\/script>/,
      )[1],
    );
    assert.equal(data.stories[0].headline, malicious);
    assert.equal(data.stories[0].link, "#");
    assert.ok(html.includes("Missing core category"));
    assert.ok(html.includes("2026-10-14/index.html"));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
