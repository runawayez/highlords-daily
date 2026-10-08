import test from "node:test";
import assert from "node:assert/strict";
import { applyEditorialGuardrails } from "../presets/br/routing.mjs";
import { applySemanticReview } from "../plugins/10-semantic-editorial-review.plugin.mjs";
import { normalizeNewsletter } from "../src/editorial/edition.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { parse } from "yaml";
import fs from "node:fs/promises";

const universalExpansion = [
  "politica-sociedade",
  "ciencia",
  "saude",
  "clima-meio-ambiente",
  "futuro",
];

test("built-in BR routing is language-agnostic and does not classify by keywords", () => {
  const inputs = [
    {
      originalTitle: "Resultado da Lotofácil de hoje: números e ganhadores",
      excerpt: "Confira o resultado do sorteio.",
      language: "pt-BR",
      focus: ["futuro", "economia"],
      strictFocus: false,
    },
    {
      originalTitle: "Resultados de la lotería nacional y números ganadores",
      excerpt: "Sorteo celebrado en Buenos Aires.",
      language: "es-AR",
      focus: ["futuro"],
      strictFocus: false,
    },
    {
      originalTitle: "新しい映画シリーズの予告編が公開",
      excerpt: "ストリーミング作品の新シーズン。",
      language: "ja-JP",
      focus: ["filmes-series", "software-internet"],
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
        category: "futuro",
        originalTitle: "La inflación mensual vuelve a acelerarse",
        focus: ["economia", "futuro"],
        strictFocus: false,
      },
      {
        id: 2,
        category: "futuro",
        originalTitle: "Resultado de lotería y números ganadores",
        focus: ["futuro"],
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
    category: "hardware",
    originalTitle: "New GPU architecture announced",
    focus: ["hardware", "futuro"],
    strictFocus: false,
  };
  const result = applySemanticReview(
    [article],
    [
      {
        id: 10,
        action: "reclassify",
        category: "futuro",
        confidence: 0.41,
        reason: "Uncertain overlap with emerging technology.",
      },
    ],
  );

  assert.equal(result.articles[0].category, "hardware");
  assert.equal(result.stats.kept, 1);
  assert.equal(result.stats.ignored, 1);
});

test("bundled presets expose the universal taxonomy and semantic review", async () => {
  for (const preset of ["br", "global"]) {
    const categories = parse(
      await fs.readFile(
        new URL(`../presets/${preset}/categories.yml`, import.meta.url),
        "utf8",
      ),
    ).categories;
    const feeds = parse(
      await fs.readFile(
        new URL(`../presets/${preset}/feeds.yml`, import.meta.url),
        "utf8",
      ),
    ).feeds;
    const metadata = JSON.parse(
      await fs.readFile(
        new URL(`../presets/${preset}/preset.json`, import.meta.url),
        "utf8",
      ),
    );

    const categorySlugs = new Set(categories.map((category) => category.slug));
    const sourceCoverage = new Set(feeds.flatMap((feed) => feed.focus || []));

    assert.equal(categorySlugs.size, 16);
    for (const slug of universalExpansion) {
      assert.ok(categorySlugs.has(slug), `${preset} missing ${slug}`);
      assert.ok(
        sourceCoverage.has(slug),
        `${preset} has no source for ${slug}`,
      );
    }

    for (const slug of [
      "politica-sociedade",
      "ciencia",
      "saude",
      "clima-meio-ambiente",
    ]) {
      const category = categories.find((item) => item.slug === slug);
      assert.ok(category.labels.pt, `${preset}/${slug} missing pt label`);
      assert.ok(category.labels.en, `${preset}/${slug} missing en label`);
      assert.ok(category.labels.es, `${preset}/${slug} missing es label`);
    }

    assert.equal(
      categories.find((category) => category.slug === "futuro").name,
      "Futuro & Inovação",
    );
    assert.ok(categorySlugs.has("esports"));
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
    assert.ok(!metadata.plugins.includes("00-esports-routing.plugin.mjs"));
  }
});

test("edition keeps esports separate and template groups header with first row without a hero title", () => {
  const articles = [
    { id: 1, category: "ia", score: 5, source: "A" },
    ...Array.from({ length: 5 }, (_, i) => ({
      id: i + 2,
      category: "games",
      score: 4.5,
      source: "Games " + i,
      headline: "Jogo " + i,
    })),
    {
      id: 8,
      category: "esports",
      score: 4.6,
      source: "Dust2",
      headline: "Mercado competitivo",
    },
  ];
  const edition = normalizeNewsletter(
    {
      title: "Análise de Notícias do Dia",
      intro: "Texto de abertura",
      leadId: 1,
      sections: {},
    },
    articles,
    "2026-10-07",
  );
  assert.ok(
    edition.sections
      .find((section) => section.slug === "esports")
      .articles.some((article) => article.id === 8),
  );
  const games = edition.sections.find((section) => section.slug === "games");
  games.articles = articles.filter((article) => article.category === "games");
  const html = renderNewsletterHtml(edition);
  assert.ok(!html.includes("<h1>"));
  assert.ok(html.includes('<p class="hero-intro">Texto de abertura</p>'));
  assert.match(
    html,
    /class="section-start"><div class="section-title">[\s\S]*?<div class="section-grid(?: [^"]+)?">/,
  );
  assert.equal((html.match(/class="story-card /g) || []).length, 7);
  assert.ok(html.includes('id="esports"'));
});
