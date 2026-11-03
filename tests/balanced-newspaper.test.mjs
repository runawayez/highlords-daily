import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  balanceStories,
  editorialFamily,
  storyKind,
  isFootball,
} from "../src/editorial/balance.mjs";
import { recordDiversity } from "../src/editorial/diversity-history.mjs";
import { categoryEvidence } from "../src/editorial/category-evidence.mjs";
import {
  normalizeNewsletter,
  validateNewsletterContract,
} from "../src/editorial/edition.mjs";
import { renderNewsletterHtml } from "../src/template.mjs";
import { applyCopyIntegrity } from "../plugins/09-copy-integrity.plugin.mjs";
import { applySemanticReview } from "../plugins/10-semantic-editorial-review.plugin.mjs";
import { config, categories } from "../src/config.mjs";

const taxonomy = [
  "hardware",
  "mobile-gadgets",
  "software-internet",
  "desenvolvimento",
  "futebol",
  "esportes",
  "economia",
  "politica-sociedade",
  "mundo",
  "ciencia",
  "saude",
  "filmes-series",
  "games",
  "esports",
].map((slug) => ({ slug, name: slug }));
const settings = {
  editorialBalance: "auto",
  editionMaxStories: 16,
  llmMinScore: 4,
  maxItemsPerSource: 3,
  maxItemsPerSourcePerSection: 1,
};
function story(id, category, score = 7, extra = {}) {
  return {
    id,
    category,
    originalTitle: `Report ${id}`,
    headline: `Report ${id}`,
    summary: `Context ${id}.`,
    excerpt: `Context ${id}.`,
    language: "pt-BR",
    topicKey: `topic-${id}`,
    source: `Publisher ${id}`,
    sectionScore: score,
    frontPageScore: score,
    score,
    publishedAt: new Date().toISOString(),
    link: `https://example.org/${id}`,
    ...extra,
  };
}
function crowdedDay() {
  let id = 1;
  const articles = [];
  for (const category of taxonomy.map((item) => item.slug))
    for (let index = 0; index < 6; index++)
      articles.push(
        story(id++, category, category.includes("hardware") ? 9 : 7),
      );
  return articles;
}
test("a crowded general edition reserves different families and bounds all tech desks and football together", () => {
  const input = crowdedDay(),
    lead = input.find((article) => article.category === "economia");
  const result = balanceStories(input, lead, taxonomy, settings);
  assert.equal(result.articles.length, 16);
  assert.ok(
    result.articles.filter(
      (article) => editorialFamily(article) === "technology",
    ).length <= 4,
  );
  assert.ok(result.articles.filter(isFootball).length <= 2);
  assert.equal(new Set(result.articles.map(editorialFamily)).size, 8);
  assert.equal(new Set(result.articles.map((article) => article.id)).size, 16);
  assert.equal(
    result.articles.filter((article) => article.id === lead.id).length,
    1,
  );
});
test("weak missing desks are not manufactured and thematic/custom editions keep their chosen scope", () => {
  assert.equal(
    balanceStories(
      crowdedDay().filter(
        (article) => editorialFamily(article) === "technology",
      ),
      null,
      taxonomy,
      settings,
    ),
    null,
  );
  assert.equal(
    balanceStories(crowdedDay(), null, taxonomy, {
      ...settings,
      editorialBalance: "off",
    }),
    null,
  );
  const input = crowdedDay().map((article) => ({
    ...article,
    score: 1,
    sectionScore: 1,
  }));
  assert.equal(balanceStories(input, null, taxonomy, settings), null);
  const custom = ["one", "two", "three"].map((slug, index) =>
    story(index, slug),
  );
  assert.equal(
    balanceStories(
      custom,
      null,
      custom.map((article) => ({ slug: article.category })),
      settings,
    ),
    null,
  );
});
test("entity and event repetition limits include the lead and span categories", () => {
  const input = crowdedDay().map((article) => ({
    ...article,
    editorialEntities:
      editorialFamily(article) === "technology" ? ["apple"] : [],
  }));
  const lead = input[0];
  const result = balanceStories(input, lead, taxonomy, settings);
  assert.equal(
    result.articles.filter((article) =>
      article.editorialEntities.includes("apple"),
    ).length,
    2,
  );
  assert.ok(result.stats.unfilled >= 0);
});
test("November 3 contradictions recover mobile, development and football categories", () => {
  for (const [title, old, expected] of [
    [
      "Xiaomi traz versão global do 18 Pro em novembro; relógio e fones podem vir junto",
      "hardware",
      "mobile-gadgets",
    ],
    [
      "Modelo vazado do Galaxy S27 Ultra chama atenção por semelhança com iPhone 18 Pro",
      "software-internet",
      "mobile-gadgets",
    ],
    ["Pitch: Eu estou compilando HTML", "software-internet", "desenvolvimento"],
    [
      "Flick sobre reserva do Barcelona: ‘Vou ajudá-lo a recuperar a confiança’",
      "esportes",
      "futebol",
    ],
    [
      "Três jogadores do Scotland retornam após lesão para competição na Nations League",
      "esportes",
      "futebol",
    ],
  ])
    assert.equal(
      categoryEvidence({ originalTitle: title, category: old }, taxonomy),
      expected,
    );
});
test("niche formats become briefs and cannot displace a substantive lead", () => {
  assert.equal(
    storyKind({ originalTitle: "Pitch: Eu estou compilando HTML" }),
    "community",
  );
  const edition = normalizeNewsletter(
    { leadId: 1, sections: {} },
    [
      story(1, "tecnologia", 10, { storyType: "community" }),
      story(2, "economia", 8),
      story(3, "ciencia-saude", 7),
    ],
    "2026-11-03",
  );
  assert.equal(edition.lead.id, 2);
  assert.equal(validateNewsletterContract(edition).ok, true);
});
test("semantic review supplies content metadata without an extra model pass", () => {
  const article = story(1, "economia");
  const output = applySemanticReview(
    [article],
    [
      {
        id: 1,
        action: "keep",
        category: "economia",
        confidence: 0.95,
        reason: "source",
        storyType: "service",
        sport: "other",
        geographicScope: "local",
        entities: ["Company", "Company"],
      },
    ],
  ).articles[0];
  assert.equal(output.storyType, "service");
  assert.equal(output.geographicScope, "local");
  assert.deepEqual(output.editorialEntities, ["company"]);
});
test("cover has three distinct-family references and a sourced service link, without story-card duplication", () => {
  const edition = {
    editionDate: "2026-11-03",
    lead: story(1, "tecnologia"),
    topStories: [
      story(2, "economia"),
      story(3, "mundo"),
      story(4, "ciencia-saude"),
    ],
    sections: [
      {
        slug: "economia",
        name: "Economia",
        articles: [story(2, "economia", 7, { storyType: "service" })],
      },
    ],
    stats: { readingMinutes: 3 },
  };
  const html = renderNewsletterHtml(edition);
  assert.equal((html.match(/class="cover-call"/g) || []).length, 3);
  assert.ok(html.includes("O que muda para você"));
  assert.equal((html.match(/data-story-id=/g) || []).length, 2);
  assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
});
test("source hype is cleaned while original evidence and factual quotes survive", () => {
  const input = {
    originalTitle: "Atriz tem retorno CONFIRMADO em filme",
    excerpt:
      "A atriz confirmou o retorno. 🚨 RAINHA! Ela disse: ‘Estou feliz’.",
    language: "pt-BR",
  };
  const result = applyCopyIntegrity(input, "pt-BR");
  assert.ok(!result.headline.includes("CONFIRMADO"));
  assert.ok(!result.summary.includes("RAINHA"));
  assert.ok(result.summary.includes("Estou feliz"));
  assert.equal(result.excerpt, input.excerpt);
});
test("seven-edition diversity history replaces regenerated dates instead of duplicating them", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "daily-diversity-"),
  );
  try {
    for (let day = 1; day <= 9; day++)
      await recordDiversity(
        {
          editionDate: `2026-11-0${day}`,
          lead: story(day, "economia"),
          sections: [],
        },
        directory,
      );
    const latest = await recordDiversity(
      {
        editionDate: "2026-11-09",
        lead: story(10, "tecnologia"),
        sections: [],
      },
      directory,
    );
    assert.equal(latest.length, 7);
    assert.equal(latest[0].date, "2026-11-03");
    assert.equal(latest.at(-1).families.technology, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("existing guided Society presets gain World and general feeds without rewriting saved files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "daily-upgrade-"));
  try {
    await fs.writeFile(
      path.join(directory, "preset.json"),
      JSON.stringify({ coverage: ["BR"] }),
    );
    const original =
      "preset: personal\ncategories:\n  - slug: politica-sociedade\n    name: Sociedade\n";
    await fs.writeFile(path.join(directory, "categories.yml"), original);
    await fs.writeFile(path.join(directory, "feeds.yml"), "feeds: []\n");
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import {categories,feeds} from './src/config.mjs';console.log(JSON.stringify({categories:categories.map(c=>c.slug),feeds:feeds.map(f=>f.url)}))",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HIGHLORDS_PROFILE: "true",
          PRESET: "custom",
          PRESET_DIR: directory,
          CATEGORIES_FILE: "",
          FEEDS_FILE: "",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.ok(output.categories.includes("mundo"));
    assert.equal(output.feeds.length, 2);
    assert.equal(
      await fs.readFile(path.join(directory, "categories.yml"), "utf8"),
      original,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("technology stays at a quarter or less even when the general edition is underfilled", () => {
  const input = crowdedDay().filter((article) =>
    ["technology", "sports", "economy"].includes(editorialFamily(article)),
  );
  const result = balanceStories(
    input,
    input.find((article) => article.category === "economia"),
    taxonomy,
    settings,
  );
  assert.ok(result.stats.distribution.technology.share <= 0.25);
  assert.ok(result.stats.unfilled > 0);
});

test("observed malformed Portuguese translations trigger bounded source-based recovery", async () => {
  const { recoverLocalizedCopy, needsCopyLocalization } =
    await import("../src/services/localized-copy.mjs");
  const input = {
    id: 1,
    language: "en-GB",
    originalTitle: "Scotland players return after injury",
    excerpt: "Players return for Nations League matches.",
    headline: "Três jogadores do Scotland retornam",
    summary: "A equipe foi boazida após a derrota.",
  };
  assert.equal(needsCopyLocalization(input, "pt-BR"), true);
  let calls = 0;
  const result = await recoverLocalizedCopy(input, {
    language: "pt-BR",
    cache: null,
    request: async () => {
      calls++;
      return {
        language: "pt-BR",
        headline: "Jogadores da Escócia retornam após lesão",
        summary: "Os jogadores voltam para as partidas da Liga das Nações.",
        tags: ["Escócia"],
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.headline, "Jogadores da Escócia retornam após lesão");
});

test("final image replacements are reconciled through the same family limits", async () => {
  const { reconcileBalancedEdition } =
    await import("../src/editorial/edition.mjs");
  const input = [];
  let id = 0;
  for (const category of [
    "tecnologia",
    "economia",
    "mundo",
    "ciencia-saude",
    "entretenimento",
  ])
    for (let index = 0; index < 5; index++)
      input.push(story(++id, category, 7, { imageUrl: null, textOnly: true }));
  const edition = {
    editionDate: "2026-11-03",
    lead: input.find((article) => article.category === "economia"),
    topStories: [],
    sections: categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      articles: input.filter((article) => article.category === category.slug),
    })),
    stats: { balance: { enabled: true }, imageReplacements: 2 },
  };
  const result = reconcileBalancedEdition(edition);
  assert.equal(result.stats.imageReplacements, 2);
  assert.equal(result.stats.balance.enabled, true);
  assert.ok(result.stats.balance.distribution.technology.share <= 0.25);
  assert.equal(validateNewsletterContract(result).ok, true);
});
