import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import {
  applySemanticReview,
} from "../plugins/10-semantic-editorial-review.plugin.mjs";
import { applyEditorialGuardrails } from "../presets/br/routing.mjs";
import { normalizeNewsletter } from "../src/editorial/edition.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

async function readYaml(file) {
  return parseYaml(await fs.readFile(path.join(root, file), "utf8"));
}

test("built-in BR routing is language-agnostic and does not classify by keywords", () => {
  const samples = [
    {
      title: "Final de Counter-Strike define campeão",
      focus: ["games", "esports"],
      strictFocus: true,
    },
    {
      title: "Elecciones y sociedad en América Latina",
      focus: ["politica-sociedade"],
      strictFocus: true,
    },
    {
      title: "量子コンピューティングの新研究",
      focus: ["ciencia", "futuro"],
      strictFocus: true,
    },
  ];
  for (const article of samples) {
    const result = applyEditorialGuardrails(article);
    assert.equal(result.editorialReject, undefined);
    assert.equal(result.category, undefined);
  }
});

test("semantic review can reclassify and reject while enforcing strict focus", () => {
  const input = [
    {
      id: 1,
      category: "games",
      focus: ["games", "esports"],
      strictFocus: true,
      originalTitle: "CS2 Major reaches grand final",
    },
    {
      id: 2,
      category: "software-internet",
      focus: ["software-internet"],
      strictFocus: true,
      originalTitle: "Completely unrelated celebrity gossip",
    },
    {
      id: 3,
      category: "ciencia",
      focus: ["ciencia", "futuro"],
      strictFocus: true,
      originalTitle: "Quantum prototype advances",
    },
  ];
  const result = applySemanticReview(input, [
    {
      id: 1,
      action: "reclassify",
      category: "esports",
      confidence: 0.94,
      reason: "professional competition",
    },
    {
      id: 2,
      action: "reject",
      category: null,
      confidence: 0.93,
      reason: "outside taxonomy",
    },
    {
      id: 3,
      action: "reclassify",
      category: "economia",
      confidence: 0.96,
      reason: "wrongly proposed outside strict focus",
    },
  ]);
  assert.deepEqual(
    result.articles.map((article) => [article.id, article.category]),
    [[1, "esports"]],
  );
  assert.equal(result.stats.reclassified, 1);
  assert.equal(result.stats.rejected, 2);
});

test("semantic review ignores low-confidence destructive changes", () => {
  const input = [
    {
      id: 11,
      category: "games",
      focus: ["games", "esports"],
      strictFocus: true,
    },
  ];
  const result = applySemanticReview(input, [
    {
      id: 11,
      action: "reject",
      category: null,
      confidence: 0.3,
      reason: "uncertain",
    },
  ]);
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].category, "games");
  assert.equal(result.stats.ignored, 1);
});

test("bundled presets expose the universal taxonomy and semantic review", async () => {
  for (const preset of ["br", "global"]) {
    const categories = await readYaml(`presets/${preset}/categories.yml`);
    const metadata = JSON.parse(
      await fs.readFile(path.join(root, `presets/${preset}/preset.json`), "utf8"),
    );
    const slugs = categories.categories.map((category) => category.slug);
    for (const slug of [
      "ia",
      "desenvolvimento",
      "mobile-gadgets",
      "hardware",
      "software-internet",
      "games",
      "filmes-series",
      "futebol",
      "esportes",
      "esports",
      "economia",
      "politica-sociedade",
      "ciencia",
      "saude",
      "clima-meio-ambiente",
      "futuro",
    ])
      assert.ok(slugs.includes(slug), `${preset} missing ${slug}`);
    assert.ok(
      metadata.plugins.includes("10-semantic-editorial-review.plugin.mjs"),
    );
    assert.ok(!metadata.plugins.includes("00-esports-routing.plugin.mjs"));
  }

  const feeds = (await readYaml("presets/br/feeds.yml")).feeds;
  assert.ok(
    feeds.filter(
      (feed) =>
        feed.focus.length === 1 &&
        feed.focus[0] === "esports" &&
        feed.strict_focus,
    ).length >= 2,
  );
});

test("edition keeps configured sections and treats highlights as references", () => {
  const articles = [
    {
      id: 1,
      category: "ia",
      score: 8.8,
      frontPageScore: 9.4,
      sectionScore: 8.8,
      source: "AI Wire",
      headline: "Manchete principal",
    },
    {
      id: 2,
      category: "economia",
      score: 8.2,
      frontPageScore: 8.8,
      source: "Economy Wire",
      headline: "Economia do dia",
    },
    {
      id: 3,
      category: "ciencia",
      score: 8,
      frontPageScore: 8.6,
      source: "Science Wire",
      headline: "Ciência do dia",
    },
    {
      id: 4,
      category: "games",
      score: 7.8,
      frontPageScore: 8.4,
      source: "Games Front",
      headline: "Games em destaque",
    },
    {
      id: 5,
      category: "games",
      score: 7.4,
      sectionScore: 8.1,
      source: "Games A",
      headline: "Jogo A",
    },
    {
      id: 6,
      category: "games",
      score: 7.2,
      sectionScore: 7.9,
      source: "Games B",
      headline: "Jogo B",
    },
    {
      id: 7,
      category: "esports",
      score: 7.6,
      sectionScore: 8.3,
      source: "eSports A",
      headline: "Competitivo A",
    },
    {
      id: 8,
      category: "esports",
      score: 7.3,
      sectionScore: 8,
      source: "eSports B",
      headline: "Competitivo B",
    },
    {
      id: 9,
      category: "hardware",
      score: 7.1,
      frontPageScore: 7.5,
      source: "Hardware Wire",
      headline: "Hardware também merece seção",
    },
  ];

  const edition = normalizeNewsletter(
    {
      title: "Edição do dia",
      intro: "Texto de abertura",
      frontPageTitle: "Front Page",
      leadId: 1,
      topStoryIds: [2, 3, 4],
      sectionOrder: ["esports", "games"],
      sections: {
        esports: [7, 8],
        games: [5, 6],
      },
    },
    articles,
    "2026-10-08",
  );

  assert.equal(edition.lead.id, 1);
  assert.equal(edition.topStories.length, 3);
  assert.deepEqual(
    edition.topStories.slice(0, 2).map((article) => article.id),
    [2, 3],
  );
  assert.deepEqual(
    edition.sections.map((section) => section.slug),
    ["hardware", "games", "esports", "economia", "ciencia"],
  );
  assert.ok(edition.sections.some((section) => section.slug === "hardware"));

  const sectionIds = new Set(
    edition.sections.flatMap((section) =>
      section.articles.map((article) => article.id),
    ),
  );
  for (const highlight of edition.topStories) {
    assert.ok(sectionIds.has(highlight.id));
    assert.notEqual(highlight.id, edition.lead.id);
  }
  assert.ok(!sectionIds.has(edition.lead.id));
  assert.equal(edition.stats.stories, sectionIds.size + 1);
  assert.notEqual(edition.frontPageTitle, "Front Page");

  const html = renderNewsletterHtml(edition);
  assert.ok(!html.includes("<h1>"));
  assert.ok(!html.includes("Front Page"));
  assert.ok(html.includes('<p class="hero-intro">Texto de abertura</p>'));
  assert.ok(html.includes('id="front-page"'));
  assert.equal((html.match(/class="front-story"/g) || []).length, 3);
  assert.ok(!html.includes('id="ia"'));
  assert.ok(html.indexOf('id="front-page"') < html.indexOf('id="hardware"'));
  assert.ok(html.indexOf('id="hardware"') < html.indexOf('id="games"'));
  assert.ok(html.indexOf('id="games"') < html.indexOf('id="esports"'));
  assert.match(
    html,
    /class="section-start"><div class="section-title">[\s\S]*?<div class="section-grid(?: [^"]+)?">/,
  );
});
