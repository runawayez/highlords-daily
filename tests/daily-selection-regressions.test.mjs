import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parse } from "yaml";
import {
  categoryEvidence,
  enforceCategoryEvidence,
} from "../src/editorial/category-evidence.mjs";
import { isEsports } from "../src/editorial/esports.mjs";
import { normalizeNewsletter } from "../src/editorial/edition.mjs";
import { categories, config } from "../src/config.mjs";
import { requestItemReview } from "../src/services/editorial-review.mjs";
import { itemsSchema } from "../src/services/ollama-client.mjs";
import { analyzeArticles } from "../src/services/ollama.mjs";

const cases = [
  [
    "Apple anuncia MacBook Pro com tela OLED sensível a toques; veja preços",
    "esports",
    "hardware",
    "tecnologia",
  ],
  [
    "Lançamentos da Netflix em novembro têm esquenta para o Natal e estreias originais",
    "esports",
    "filmes-series",
    "entretenimento",
  ],
  [
    "Dev faz Mario Kart World rodar no iPhone dias após jailbreak do Switch 2",
    "ciencia",
    "games",
    "games",
  ],
];
test("October 29 source titles recover their actual desks with default and setup taxonomies", async () => {
  for (const [preset, column] of [
    ["global", 2],
    ["br", 3],
  ]) {
    const taxonomy = parse(
      await fs.readFile(
        new URL(`../presets/${preset}/categories.yml`, import.meta.url),
        "utf8",
      ),
    ).categories;
    const input = cases.map(([originalTitle, category], index) => ({
      id: index + 1,
      originalTitle,
      category,
    }));
    assert.deepEqual(
      enforceCategoryEvidence(input, taxonomy).map((item) => item.category),
      cases.map((row) => row[column]),
    );
    assert.deepEqual(
      enforceCategoryEvidence(
        input.map((item) => ({ ...item, category: "esports" })),
        taxonomy,
      ).map((item) => item.category),
      cases.map((row) => row[column]),
    );
  }
});
test("focus, generated copy and ambiguous market vocabulary cannot manufacture competitive evidence", () => {
  for (const originalTitle of [
    "Fluxo de investimentos e receita aumenta",
    "Campeonato europeu de curling começa",
    cases[0][0],
    cases[1][0],
  ])
    assert.equal(
      isEsports({ originalTitle, strictFocus: true, focus: ["esports"] }),
      false,
    );
  assert.equal(
    isEsports({ originalTitle: "CS2: FURIA avança à semifinal do Major" }),
    true,
  );
  assert.equal(
    isEsports({
      originalTitle: "FURIA anuncia novo patrocinador para suas equipes",
    }),
    true,
  );
  assert.equal(
    categoryEvidence(
      { originalTitle: "Ação judicial contra empresa", headline: cases[0][0] },
      categories,
    ),
    null,
  );
  assert.equal(
    enforceCategoryEvidence(
      [
        {
          originalTitle: cases[0][0],
          category: "esports",
          strictFocus: true,
          focus: ["esports"],
        },
      ],
      categories,
    ).length,
    0,
  );
  assert.equal(
    categoryEvidence({ originalTitle: cases[0][0] }, [
      { slug: "custom-science" },
    ]),
    null,
  );
});

function story(id, score, age = 1) {
  return {
    id,
    category: categories[0].slug,
    source: `Source ${id}`,
    originalTitle: `Story ${id}`,
    headline: `Story ${id}`,
    summary: `Summary ${id}`,
    topicKey: `topic-${id}`,
    score,
    sectionScore: score,
    frontPageScore: score,
    publishedAt: new Date(Date.now() - age * 3600000).toISOString(),
  };
}
test("daily selection favors fresh reporting and ranks sections above weak curator preferences", () => {
  const previous = {
    items: config.itemsPerCategory,
    primary: config.primaryLookbackHours,
  };
  config.itemsPerCategory = 1;
  config.primaryLookbackHours = 48;
  try {
    const edition = normalizeNewsletter(
      { leadId: 1, sections: { [categories[0].slug]: [4] } },
      [story(1, 10, 100), story(2, 9), story(3, 8), story(4, 4)],
      "2026-10-29",
    );
    assert.equal(edition.lead.id, 2);
    assert.equal(edition.sections[0].articles[0].id, 3);
  } finally {
    config.itemsPerCategory = previous.items;
    config.primaryLookbackHours = previous.primary;
  }
});
test("partial independent reviews retry missing rows with local IDs and retain original identity", async () => {
  const schema = itemsSchema({
    id: { type: "integer", enum: [41, 906] },
    category: { type: "string" },
  });
  let calls = 0;
  const rows = await requestItemReview(
    "Review",
    [
      { id: 41, title: "One" },
      { id: 906, title: "Two" },
    ],
    {
      namespace: "test",
      schema,
      cache: null,
      request: async (_system, user, options) => {
        const input = JSON.parse(user);
        calls++;
        assert.deepEqual(
          input.map((item) => item.id),
          calls === 1 ? [1, 2] : [1],
        );
        assert.deepEqual(
          options.schema.properties.items.items.properties.id.enum,
          input.map((item) => item.id),
        );
        return { items: [{ id: 1, category: input[0].title }] };
      },
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(rows, [
    { id: 41, category: "One" },
    { id: 906, category: "Two" },
  ]);
});
test("a single-category source cannot override a model rejection or rescue a negligible story", async () => {
  const originalFetch = globalThis.fetch,
    previousCache = config.analysisCacheDays;
  config.analysisCacheDays = 0;
  globalThis.fetch = async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            items: input.map((item) => ({
              id: item.id,
              category: item.title === "Rejected" ? null : categories[0].slug,
              score: item.title === "Rejected" ? 8 : 1,
              topicKey: item.title,
              headline: item.title,
              summary: "A short report.",
              tags: [],
            })),
          }),
        },
      }),
    );
  };
  try {
    const output = await analyzeArticles(
      ["Rejected", "Weak"].map((originalTitle, index) => ({
        id: index + 40,
        originalTitle,
        excerpt: "A short report.",
        language: "en",
        focus: [categories[0].slug],
        strictFocus: true,
        editorialGuardrail: "strict-single-category-source",
      })),
    );
    assert.deepEqual(output, []);
  } finally {
    globalThis.fetch = originalFetch;
    config.analysisCacheDays = previousCache;
  }
});

test("a later plugin cannot reintroduce the October 29 categorization errors", async () => {
  const { createDailyServices } = await import("../src/daily.mjs");
  const input = cases.map(([originalTitle, category], index) => ({
    id: index + 1,
    originalTitle,
    category,
    excerpt: originalTitle,
    source: `Source ${index}`,
    link: `https://example.org/${index}`,
    headline: originalTitle,
    summary: originalTitle,
  }));
  const services = createDailyServices([
    {
      name: "Faulty reviewer",
      module: {
        afterAnalyze: ({ articles }) => ({
          articles: articles.map((article) => ({
            ...article,
            category: "esports",
          })),
        }),
      },
    },
  ]);
  const result = await services.rank(input, { editionDate: "2026-10-29" });
  assert.deepEqual(
    result.map((item) => item.category),
    ["tecnologia", "entretenimento", "games"],
  );
});

test("a failed omission retry retains successful independent decisions", async () => {
  let calls = 0;
  const result = await requestItemReview("Review", [{ id: 10 }, { id: 20 }], {
    namespace: "test",
    schema: itemsSchema({
      id: { type: "integer" },
      category: { type: "string" },
    }),
    cache: null,
    request: async () => {
      if (++calls === 2) throw new Error("Offline");
      return { items: [{ id: 1, category: "games" }] };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, [{ id: 10, category: "games" }]);
});

test("unsupported source languages retain semantic classification instead of failing a Latin evidence check", () => {
  const input = {
    originalTitle: "电子竞技战队签下新选手",
    language: "zh-CN",
    category: "esports",
  };
  assert.equal(
    enforceCategoryEvidence([input], categories)[0].category,
    "esports",
  );
});
