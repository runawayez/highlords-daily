import test from "node:test";
import assert from "node:assert/strict";
import { isEsports } from "../src/editorial/esports.mjs";
import esports from "../plugins/00-esports-routing.plugin.mjs";
import { applyEditorialGuardrails } from "../presets/br/routing.mjs";
import { normalizeNewsletter } from "../src/editorial/edition.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { parse } from "yaml";
import fs from "node:fs/promises";

test("esports market and roster news survive routing without an explicit game name", () => {
  const inputs = [
    {
      originalTitle: "FURIA anuncia novo patrocinador para a próxima temporada",
      focus: ["games", "esports"],
    },
    {
      originalTitle: "Astralis procura substitutos para dois jogadores",
      focus: ["esports"],
    },
    {
      originalTitle:
        "Organização anuncia investimento e parceria de transmissão",
      focus: ["esports"],
    },
    {
      originalTitle: "Valve atualiza situação da BC.GAME no Major",
      focus: ["esports"],
    },
  ];
  for (const input of inputs) {
    const article = {
      ...input,
      strictFocus: true,
      language: "pt-BR",
      category: "games",
    };
    assert.equal(isEsports(article), true, input.originalTitle);
    const collected = applyEditorialGuardrails(article);
    assert.equal(collected.editorialReject, undefined);
    assert.deepEqual(collected.focus, ["esports"]);
    assert.equal(
      esports.afterAnalyze({ articles: [collected] }).articles[0].category,
      "esports",
    );
  }
});

test("game launches and hardware do not become esports", () => {
  for (const originalTitle of [
    "GTA 6 chega ao Xbox e Steam",
    "MSI lança placa de vídeo para gamers",
    "VALORANT recebe patch com novo mapa",
  ]) {
    assert.equal(
      isEsports({
        originalTitle,
        focus: ["games", "esports"],
        strictFocus: true,
      }),
      false,
    );
  }
  const corrected = esports.afterAnalyze({
    articles: [
      {
        originalTitle: "Novo jogo chega ao Steam",
        category: "esports",
        focus: ["games", "esports"],
      },
    ],
  }).articles;
  assert.equal(corrected[0].category, "games");
});

test("bundled presets expose a separate esports category and dedicated sources", async () => {
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
    assert.ok(categories.some((x) => x.slug === "esports"));
    assert.ok(
      feeds.filter(
        (x) =>
          x.focus.length === 1 && x.focus[0] === "esports" && x.strict_focus,
      ).length >= 2,
    );
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
      .find((x) => x.slug === "esports")
      .articles.some((x) => x.id === 8),
  );
  const games = edition.sections.find((x) => x.slug === "games");
  games.articles = articles.filter((x) => x.category === "games");
  const html = renderNewsletterHtml(edition);
  assert.ok(!html.includes("<h1>"));
  assert.ok(html.includes('<p class="hero-intro">Texto de abertura</p>'));
  assert.match(
    html,
    /class="section-start"><div class="section-title">[\s\S]*?<div class="section-grid">/,
  );
  assert.equal((html.match(/class="story-card /g) || []).length, 7);
  assert.ok(html.includes('id="esports"'));
});
