import test from "node:test";
import assert from "node:assert/strict";
import { applyEditorialGuardrails } from "../presets/br/routing.mjs";
import { applySemanticReview } from "../plugins/10-semantic-editorial-review.plugin.mjs";
import { normalizeNewsletter } from "../src/editorial/edition.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { parse } from "yaml";
import fs from "node:fs/promises";

const brDailySlugs = [
  "tecnologia",
  "ia-desenvolvimento",
  "games",
  "esports",
  "entretenimento",
  "esportes",
  "economia",
  "politica-sociedade",
  "ciencia-saude",
  "clima-futuro",
];

const brRequiredSlugs = [
  "tecnologia",
  "ia-desenvolvimento",
  "games",
  "economia",
  "politica-sociedade",
];

test("built-in BR routing is language-agnostic and does not classify by keywords", () => {
  const inputs = [
    {
      originalTitle: "Resultado da Lotofácil de hoje: números e ganhadores",
      excerpt: "Confira o resultado do sorteio.",
      language: "pt-BR",
      focus: ["clima-futuro", "economia"],
      strictFocus: false,
    },
    {
      originalTitle: "Resultados de la lotería nacional y números ganadores",
      excerpt: "Sorteo celebrado en Buenos Aires.",
      language: "es-AR",
      focus: ["clima-futuro"],
      strictFocus: false,
    },
    {
      originalTitle: "新しい映画シリーズの予告編が公開",
      excerpt: "ストリーミング作品の新シーズン。",
      language: "ja-JP",
      focus: ["entretenimento", "tecnologia"],
      strictFocus: true,
    },
  ];

  for (const input of inputs) {
    const routed = applyEditorialGuardrails(input);
    assert.equal(routed.editorialReject, undefined);
    assert.equal(routed.editorialGuardrail, undefined);
    assert.deepEqual(routed.focus, input.focus);
    assert.equal(routed.strictFocus, input.strictFocus);
  }
});

test("semantic review can reclassify and reject while enforcing strict focus", () => {
  const result = applySemanticReview(
    [
      {
        id: 1,
        category: "clima-futuro",
        originalTitle: "La inflación mensual vuelve a acelerarse",
        focus: ["economia", "clima-futuro"],
        strictFocus: false,
      },
      {
        id: 2,
        category: "clima-futuro",
        originalTitle: "Resultado de lotería y números ganadores",
        focus: ["clima-futuro"],
        strictFocus: false,
      },
      {
        id: 3,
        category: "games",
        originalTitle: "Competitive roster change",
        focus: ["games"],
        strictFocus: true,
      },
    ],
    [
      {
        id: 1,
        action: "reclassify",
        category: "economia",
        confidence: 0.97,
        reason: "Macroeconomic inflation story.",
      },
      {
        id: 2,
        action: "reject",
        category: null,
        confidence: 0.96,
        reason: "Lottery result does not fit the configured taxonomy.",
      },
      {
        id: 3,
        action: "reclassify",
        category: "esports",
        confidence: 0.95,
        reason: "Competitive gaming context.",
      },
    ],
  );

  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].category, "economia");
  assert.equal(result.articles[0].semanticReview, "reclassified");
  assert.deepEqual(result.stats, {
    kept: 0,
    reclassified: 1,
    rejected: 2,
    ignored: 0,
  });
});

test("semantic review ignores low-confidence destructive changes", () => {
  const article = {
    id: 10,
    category: "tecnologia",
    originalTitle: "New GPU architecture announced",
    focus: ["tecnologia", "clima-futuro"],
    strictFocus: false,
  };
  const result = applySemanticReview(
    [article],
    [
      {
        id: 10,
        action: "reclassify",
        category: "clima-futuro",
        confidence: 0.41,
        reason: "Uncertain overlap with emerging technology.",
      },
    ],
  );

  assert.equal(result.articles[0].category, "tecnologia");
  assert.equal(result.stats.kept, 1);
  assert.equal(result.stats.ignored, 1);
});

test("BR preset exposes ten daily sections with five contractual cores", async () => {
  const categories = parse(
    await fs.readFile(
      new URL("../presets/br/categories.yml", import.meta.url),
      "utf8",
    ),
  ).categories;
  const feeds = parse(
    await fs.readFile(
      new URL("../presets/br/feeds.yml", import.meta.url),
      "utf8",
    ),
  ).feeds;
  const metadata = JSON.parse(
    await fs.readFile(
      new URL("../presets/br/preset.json", import.meta.url),
      "utf8",
    ),
  );

  const categorySlugs = categories.map((category) => category.slug);
  const requiredSlugs = categories
    .filter((category) => category.required !== false)
    .map((category) => category.slug);
  const sourceCoverage = new Set(feeds.flatMap((feed) => feed.focus || []));

  assert.deepEqual(categorySlugs, brDailySlugs);
  assert.deepEqual(requiredSlugs, brRequiredSlugs);
  for (const slug of brDailySlugs) {
    assert.ok(sourceCoverage.has(slug), `BR has no source for ${slug}`);
  }
  assert.ok(
    feeds.filter(
      (feed) =>
        feed.focus.length === 1 &&
        feed.focus[0] === "esports" &&
        feed.strict_focus,
    ).length >= 2,
  );
  assert.ok(
    metadata.plugins.includes("10-semantic-editorial-review.plugin.mjs"),
  );
  assert.ok(metadata.plugins.includes("99-editorial-quality-gate.plugin.mjs"));
});

test("global preset remains independent from the compact BR daily taxonomy", async () => {
  const categories = parse(
    await fs.readFile(
      new URL("../presets/global/categories.yml", import.meta.url),
      "utf8",
    ),
  ).categories;
  assert.equal(categories.length, 16);
});

test("edition keeps configured sections and treats highlights as references", () => {
  const articles = [
    {
      id: 1,
      category: "ia-desenvolvimento",
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
      category: "ciencia-saude",
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
      category: "tecnologia",
      score: 7.1,
      frontPageScore: 7.5,
      source: "Tech Wire",
      headline: "Tecnologia também merece seção",
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
    edition.sections.map((section) => section.slug),
    ["tecnologia", "games", "esports", "economia", "ciencia-saude"],
  );

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
  assert.ok(!html.includes('class="hero-intro"'));
  assert.ok(!html.includes("Texto de abertura"));
  assert.ok(html.includes('id="front-page"'));
  assert.equal((html.match(/class="front-story"/g) || []).length, 3);
  assert.ok(!html.includes('id="ia-desenvolvimento"'));
  assert.ok(
    html.indexOf('class="lead-wrap"') < html.indexOf('id="front-page"'),
  );
  assert.ok(
    html.indexOf('id="front-page"') < html.indexOf('id="tecnologia"'),
  );
  assert.ok(html.indexOf('id="tecnologia"') < html.indexOf('id="games"'));
  assert.ok(html.indexOf('id="games"') < html.indexOf('id="esports"'));
  assert.ok(
    html.includes(".section-grid.solo-text .story-body{display:block!important"),
  );
});
