import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";

function story(overrides = {}) {
  return {
    id: 1,
    category: "software-internet",
    source: "Example",
    originalTitle: "Original story title",
    headline: "Editorial story title",
    summary: "A concise summary written for the reader.",
    link: "https://example.com/story",
    score: 5.8,
    sectionScore: 7.2,
    frontPageScore: 7.4,
    tags: ["tag-one", "tag-two"],
    ...overrides,
  };
}

test("renderer composes solo text and mixed sections without exposing internal scores", () => {
  const edition = {
    editionDate: "2026-10-08",
    intro: "Uma abertura editorial curta sobre os assuntos que importam hoje.",
    profile: "Vanilla",
    stats: { stories: 4, sources: 3 },
    lead: story({
      id: 90,
      category: "ia",
      headline: "Manchete principal",
      imageUrl: null,
      displayImage: false,
    }),
    topStories: [],
    sections: [
      {
        slug: "desenvolvimento",
        name: "Desenvolvimento",
        presentation: { layout: "solo-text", featureId: 1 },
        articles: [
          story({
            id: 1,
            category: "desenvolvimento",
            headline:
              "Plataforma para ensino de programação com Python no celular",
            imageUrl: null,
            displayImage: false,
            displayRole: "feature",
          }),
        ],
      },
      {
        slug: "software-internet",
        name: "Software e Internet",
        presentation: { layout: "mixed-grid", featureId: 2 },
        articles: [
          story({
            id: 2,
            headline: "Uma matéria visual forte",
            imageUrl: "assets/editorial.jpg",
            displayImage: true,
            displayRole: "feature",
          }),
          story({
            id: 3,
            headline: "Uma nota tipográfica ao lado",
            imageUrl: "assets/rejected-graphic.jpg",
            displayImage: false,
            displayRole: "brief",
          }),
        ],
      },
    ],
  };

  const html = renderNewsletterHtml(edition);
  assert.ok(html.includes('class="section-grid first-row single solo-text"'));
  assert.ok(html.includes('class="section-grid first-row mixed-grid"'));
  assert.ok(html.includes('grid-template-areas:"meta meta" "title summary"'));
  assert.equal((html.match(/class="story-image"/g) || []).length, 1);
  assert.ok(!html.includes("<b>5.8</b>"));
  assert.ok(!html.includes("rejected-graphic.jpg"));
});

test(
  "editorial presentation uses Ollama for hierarchy while suppressing weak graphics",
  { timeout: 10000 },
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "highlords-presentation-"),
    );
    const assets = path.join(directory, "assets");
    await fs.mkdir(assets, { recursive: true });
    await fs.writeFile(path.join(assets, "good.jpg"), Buffer.alloc(80000, 31));
    await fs.writeFile(path.join(assets, "weak.jpg"), Buffer.alloc(20000, 17));

    const previousFetch = globalThis.fetch;
    const previousHost = config.ollamaHost;
    const previousCacheDir = config.cacheDir;
    config.ollamaHost = "http://ollama.presentation.test";
    config.cacheDir = path.join(directory, "cache");
    let calls = 0;

    globalThis.fetch = async (url, options = {}) => {
      assert.equal(String(url), "http://ollama.presentation.test/api/chat");
      calls += 1;
      const query = JSON.parse(options.body);
      const input = JSON.parse(query.messages[1].content);
      assert.equal(input.sections[0].stories[0].hasImage, true);
      assert.equal(input.sections[0].stories[1].hasImage, false);
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              sections: [
                {
                  slug: "software-internet",
                  layout: "feature",
                  articleIds: [1, 2],
                  featureId: 1,
                },
              ],
            }),
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const module = await import(
        `../plugins/20-editorial-presentation.plugin.mjs?test=${Date.now()}`
      );
      const result = await module.beforeRender({
        editionDir: directory,
        edition: {
          editionDate: "2026-10-08",
          stats: {},
          lead: story({ id: 99, imageUrl: null }),
          sections: [
            {
              slug: "software-internet",
              name: "Software e Internet",
              articles: [
                story({
                  id: 1,
                  imageUrl: "assets/good.jpg",
                  originalImageUrl: "https://cdn.example.com/photo.jpg",
                  imageWidth: 800,
                  imageHeight: 450,
                }),
                story({
                  id: 2,
                  imageUrl: "assets/weak.jpg",
                  originalImageUrl: "https://cdn.example.com/opaque.jpg",
                  imageWidth: 1200,
                  imageHeight: 675,
                }),
              ],
            },
          ],
        },
      });

      assert.equal(calls, 1);
      assert.equal(
        result.edition.stats.presentationMode,
        "ollama-art-director",
      );
      assert.equal(result.edition.stats.suppressedImages, 1);
      assert.equal(
        result.edition.sections[0].presentation.layout,
        "mixed-grid",
      );
      assert.equal(
        result.edition.sections[0].articles[0].displayRole,
        "feature",
      );
      assert.equal(result.edition.sections[0].articles[0].displayImage, true);
      assert.equal(result.edition.sections[0].articles[1].displayRole, "brief");
      assert.equal(result.edition.sections[0].articles[1].displayImage, false);
    } finally {
      globalThis.fetch = previousFetch;
      config.ollamaHost = previousHost;
      config.cacheDir = previousCacheDir;
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
