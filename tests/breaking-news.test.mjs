import test from "node:test";
import assert from "node:assert/strict";
import {
  detectBreaking,
  breakingFloor,
  breakingLift,
  remapToFocus,
  isBreaking,
} from "../src/editorial/breaking.mjs";
import { balanceStories } from "../src/editorial/balance.mjs";
import { applySemanticReview } from "../plugins/10-semantic-editorial-review.plugin.mjs";

const NOW = new Date("2026-11-13T12:00:00Z");
const iso = (hoursAgo) => new Date(NOW - hoursAgo * 3600000).toISOString();

let nextId = 0;
function article(source, title, focus, hoursAgo = 3, extra = {}) {
  nextId += 1;
  return {
    id: nextId,
    stableId: `s${nextId}`,
    source,
    publisherGroup: extra.publisherGroup || source,
    originalTitle: title,
    link: `https://example.com/${nextId}`,
    publishedAt: iso(hoursAgo),
    focus,
    strictFocus: Boolean(extra.strictFocus),
    ...extra,
  };
}

// Real titles from the 2026-11-13 edition report: the Microsoft/Outlook outage
// was covered by seven publishers and all ten items were discarded.
function microsoftDay() {
  return [
    article(
      "Canaltech",
      "Apagão da Microsoft já afeta 74 países e passa de 18 horas; ataque hacker é descartado",
      ["tecnologia", "ia-desenvolvimento"],
    ),
    article(
      "Tecnoblog",
      "Microsoft enfrenta dificuldades para religar Outlook, Teams e outros serviços",
      ["tecnologia"],
    ),
    article(
      "Agência Brasil Internacional",
      "Outlook, Teams e Copilot, da Microsoft, ainda estão fora do ar",
      ["mundo"],
      4,
      { strictFocus: true, publisherGroup: "Agência Brasil" },
    ),
    article(
      "Olhar Digital",
      "Apagão da Microsoft afeta serviços em vários países do mundo",
      ["tecnologia"],
      5,
      { strictFocus: true },
    ),
    article(
      "Olhar Digital",
      "Falha global da Microsoft ainda afeta serviços em diversos países",
      ["tecnologia"],
      2,
      { strictFocus: true },
    ),
    article(
      "g1 · Economia",
      "Falha no Outlook, Teams e Copilot rende memes nas redes sociais",
      ["economia"],
      3,
      { publisherGroup: "g1" },
    ),
    article(
      "UOL Economia",
      "Ações da Microsoft recuam em meio a apagão nos sistemas da empresa",
      ["economia"],
      3,
      { strictFocus: true, publisherGroup: "UOL" },
    ),
    article(
      "Exame",
      "Quando o Outlook vai voltar? Microsoft recupera serviço aos poucos",
      ["economia"],
      1,
      { strictFocus: true },
    ),
  ];
}

function routineNoise() {
  return [
    article("ge", "Palmeiras vence o Vasco no Allianz Parque", ["futebol"]),
    article("Trivela", "Vasco perde para o Palmeiras em casa", ["futebol"]),
    article("Adrenaline", "Zephyr lança RTX 4070 Ti Super com um cooler", [
      "hardware",
    ]),
    article("MoneyTimes", "Rumo tem resultado operacional em linha", [
      "economia",
    ]),
    article("TabNews", "Backup sem restauração testada é só uma hipótese", [
      "desenvolvimento",
    ]),
    article("InfoMoney", "JPMorgan vê ajuste fiscal insuficiente", [
      "economia",
    ]),
    article("CinePOP", "Novo trailer da série chega amanhã", ["filmes-series"]),
    article("Pipoca Moderna", "Estreias de filmes da semana no cinema", [
      "filmes-series",
    ]),
  ];
}

test("an outage covered by seven publishers on three desks is a major event", () => {
  const pool = [...microsoftDay(), ...routineNoise()];
  const clusters = detectBreaking(pool, {}, NOW);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].level, "major");
  assert.ok(clusters[0].publishers >= 6);
  assert.ok(clusters[0].families.length >= 2);
  const marked = pool.filter(isBreaking);
  assert.equal(marked.length, 8);
  assert.ok(
    marked.every((item) => /Outlook|Microsoft/.test(item.originalTitle)),
  );
});

test("unrelated routine coverage is not promoted", () => {
  const pool = routineNoise();
  assert.deepEqual(detectBreaking(pool, {}, NOW), []);
  assert.equal(pool.filter(isBreaking).length, 0);
});

test("a match covered by a single desk is not promoted as breaking news", () => {
  const pool = [
    article("ge", "Palmeiras vence o Vasco no Allianz Parque", ["futebol"]),
    article("Trivela", "Vasco perde para o Palmeiras em casa", ["futebol"]),
    article("Placar", "Palmeiras bate o Vasco por 2 a 0", ["futebol"]),
    article("UOL Esporte", "Palmeiras derrota o Vasco no Allianz", ["futebol"]),
    ...routineNoise().slice(2),
  ];
  assert.deepEqual(detectBreaking(pool, {}, NOW), []);
});

test("stories outside the time window do not form a cluster", () => {
  const pool = microsoftDay().map((item) => ({
    ...item,
    publishedAt: iso(80),
  }));
  assert.deepEqual(detectBreaking([...pool, ...routineNoise()], {}, NOW), []);
});

test("a newsroom posting many updates counts once and keeps one representative", () => {
  const pool = [...microsoftDay(), ...routineNoise()];
  detectBreaking(pool, {}, NOW);
  const olhar = pool.filter(
    (item) => item.source === "Olhar Digital" && item.breaking,
  );
  assert.equal(olhar.length, 2);
  assert.equal(olhar.filter((item) => item.breaking.representative).length, 1);
});

test("breaking floors and lifts follow the level", () => {
  assert.equal(breakingFloor({ breaking: { level: "major" } }), 7.5);
  assert.equal(breakingFloor({ breaking: { level: "notable" } }), 6);
  assert.equal(breakingFloor({}), 0);
  assert.ok(breakingLift({ breaking: { level: "major" } }).front >= 2);
  assert.deepEqual(breakingLift({}), { front: 0, section: 0 });
});

test("a strict-focus article is remapped to the source desk, never dropped", () => {
  const taxonomy = [{ slug: "mundo" }, { slug: "economia" }];
  assert.equal(
    remapToFocus({ focus: ["mundo"], strictFocus: true }, taxonomy),
    "mundo",
  );
  assert.equal(remapToFocus({ focus: ["inexistente"] }, taxonomy), null);
});

test("the semantic review cannot reject a multi-publisher event", () => {
  const pool = [...microsoftDay(), ...routineNoise()];
  detectBreaking(pool, {}, NOW);
  const target = pool.find((item) => item.source === "Tecnoblog");
  const plain = pool.find((item) => item.source === "InfoMoney");
  const rows = [
    { id: target.id, action: "reject", category: null, confidence: 0.95 },
    { id: plain.id, action: "reject", category: null, confidence: 0.95 },
  ];
  const result = applySemanticReview([target, plain], rows);
  const kept = Array.isArray(result) ? result : result.articles;
  assert.deepEqual(
    kept.map((item) => item.id),
    [target.id],
  );
});

test("balance keeps the event even when technology is capped, in at most two slots", () => {
  const pool = [...microsoftDay(), ...routineNoise()].map((item) => ({
    ...item,
    category: item.focus[0],
    score: 5,
    sectionScore: 5,
    frontPageScore: 5,
    topicKey: item.originalTitle.slice(0, 20),
  }));
  detectBreaking(pool, {}, NOW);
  for (const item of pool)
    if (item.breaking) {
      item.score = item.sectionScore = 7.5;
      item.frontPageScore = 8;
    }
  const taxonomy = [
    "tecnologia",
    "hardware",
    "mundo",
    "economia",
    "futebol",
    "filmes-series",
    "desenvolvimento",
  ].map((slug) => ({ slug, name: slug }));
  const result = balanceStories(pool, null, taxonomy, {
    editionMaxStories: 16,
    llmMinScore: 4,
    itemsPerCategory: 2,
    maxItemsPerSource: 3,
    maxItemsPerSourcePerSection: 1,
    lookbackHours: 48,
  });
  assert.ok(result, "balance must run");
  const event = result.articles.filter((item) => item.breaking);
  assert.ok(event.length >= 1 && event.length <= 2);
});

test("generic words do not chain unrelated stories into the event", () => {
  const pool = [
    ...microsoftDay(),
    article(
      "Exame",
      "Claude fora do ar? IA da Anthropic tem instabilidade nesta sexta-feira",
      ["economia"],
      3,
      { strictFocus: true },
    ),
    article(
      "Olhar Digital",
      "Hoje é sexta-feira 13! Saiba quantas existem em um ano",
      ["tecnologia"],
    ),
    article(
      "g1 · Tecnologia",
      "Outlook e IA da Microsoft seguem instáveis nesta sexta-feira",
      ["tecnologia"],
      2,
      { publisherGroup: "g1" },
    ),
    ...routineNoise(),
  ];
  detectBreaking(pool, {}, NOW);
  const titles = pool.filter(isBreaking).map((item) => item.originalTitle);
  assert.ok(titles.some((title) => /Outlook e IA da Microsoft/.test(title)));
  assert.ok(!titles.some((title) => /Claude fora do ar/.test(title)));
  assert.ok(!titles.some((title) => /sexta-feira 13/.test(title)));
});
