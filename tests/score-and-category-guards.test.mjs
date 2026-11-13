import test from "node:test";
import assert from "node:assert/strict";
import { detectScoreScale, rawScore } from "../src/editorial/score-scale.mjs";
import {
  hasSportsEvidence,
  isSportsCategory,
} from "../src/editorial/sports-evidence.mjs";
import {
  detectBreaking,
  isBreaking,
  isPromotional,
} from "../src/editorial/breaking.mjs";
import { applySemanticReview } from "../plugins/10-semantic-editorial-review.plugin.mjs";

const NOW = new Date("2026-11-13T12:00:00Z");

test("a batch answered on a 0-1 scale is rescaled to 0-10", () => {
  // 2026-11-13: "Senado aprova ajuste fiscal" 0.99 and the Microsoft outage 0.87.
  const rows = [{ score: 0.99 }, { score: 0.87 }, { score: 0.88 }];
  assert.equal(detectScoreScale(rows), 10);
});

test("normal 0-10 batches and lone low scores are not rescaled", () => {
  assert.equal(detectScoreScale([{ score: 7 }, { score: 6.5 }]), 1);
  assert.equal(detectScoreScale([{ score: 7.2 }, { score: 0.9 }]), 1);
  assert.equal(detectScoreScale([{ score: 0.5 }]), 1);
  assert.equal(detectScoreScale([{ score: 0 }, { score: 0 }]), 1);
});

test("scores in alias fields and decimal commas are read", () => {
  assert.equal(rawScore({ nota: "0,85" }), 0.85);
  assert.equal(rawScore({ relevance: 8 }), 8);
  assert.equal(rawScore({}), null);
  assert.equal(detectScoreScale([{ nota: "0,9" }, { relevancia: 0.8 }]), 10);
});

test("sports labels need sports vocabulary in the source text", () => {
  assert.ok(isSportsCategory("esportes") && isSportsCategory("futebol"));
  assert.ok(!isSportsCategory("mobile-gadgets"));
  // 2026-11-13: both were published under Esportes.
  assert.equal(
    hasSportsEvidence({
      originalTitle:
        "Quanto custaria o iPhone 5C hoje? Veja o preço corrigido pela inflação",
      excerpt:
        "O iPhone 5C está entre os modelos icônicos que marcaram a história da Apple, com 16 GB e 32 GB.",
    }),
    false,
  );
  assert.equal(
    hasSportsEvidence({
      originalTitle:
        "Maior supermercado do Brasil lança 5 mil ofertas e lojas abertas por 90 horas na Black Friday",
      excerpt: "Falar com quem trabalha no varejo sobre a Black Friday.",
    }),
    false,
  );
  assert.equal(
    hasSportsEvidence({
      originalTitle:
        "Manchester United confirmam Pochettino como substituto de Carrick",
      excerpt: "Foi confirmado como novo treinador principal do clube.",
    }),
    true,
  );
});

test("the semantic review cannot move a story into sports without evidence", () => {
  const iphone = {
    id: 1,
    category: "mobile-gadgets",
    originalTitle: "Quanto custaria o iPhone 5C hoje?",
    excerpt: "Modelo lançado em 2013 pela Apple.",
  };
  const match = {
    id: 2,
    category: "mobile-gadgets",
    originalTitle: "Pochettino é o novo treinador do Manchester United",
    excerpt: "O clube confirmou a contratação.",
  };
  const result = applySemanticReview(
    [iphone, match],
    [
      { id: 1, action: "reclassify", category: "esportes", confidence: 0.95 },
      { id: 2, action: "reclassify", category: "esportes", confidence: 0.95 },
    ],
  );
  const kept = Array.isArray(result) ? result : result.articles;
  const byId = new Map(kept.map((item) => [item.id, item]));
  assert.equal(byId.get(1).category, "mobile-gadgets");
  assert.equal(byId.get(2).category, "esportes");
});

let nextId = 1000;
function story(source, title, focus, extra = {}) {
  nextId += 1;
  return {
    id: nextId,
    source,
    publisherGroup: extra.publisherGroup || source,
    originalTitle: title,
    link: `https://example.com/${nextId}`,
    publishedAt: new Date(NOW - 3 * 3600000).toISOString(),
    focus,
  };
}

test("retail promotions are not news the press is covering", () => {
  assert.ok(
    isPromotional({
      originalTitle:
        "Maior supermercado do Brasil terá 5 mil ofertas na Black Friday",
    }),
  );
  assert.ok(
    isPromotional({
      originalTitle: "Custo-benefício: iPhone 17e chega a 33% OFF em até 12x",
    }),
  );
  assert.ok(
    !isPromotional({
      originalTitle:
        "Microsoft cita progressos adicionais na recuperação de serviços",
    }),
  );
  const pool = [
    story(
      "Adrenaline",
      "Jogos de Corrida para PlayStation em oferta de Black Friday",
      ["hardware"],
    ),
    story(
      "Canaltech",
      "7 fones em forma de brinco para ficar de olho na Black Friday",
      ["tecnologia"],
    ),
    story(
      "g1 · Tecnologia",
      "Como escolher um notebook para comprar na Black Friday",
      ["tecnologia"],
      { publisherGroup: "Globo" },
    ),
    story("Tecnoblog", "Galaxy S25 tem preço de FE em oferta de Black Friday", [
      "tecnologia",
    ]),
    story(
      "Exame",
      "Maior supermercado do Brasil terá 5 mil ofertas na Black Friday",
      ["economia"],
    ),
    story(
      "Seu Dinheiro",
      "Black Friday 2026: veja as melhores ofertas do varejo",
      ["economia"],
    ),
    story("InfoMoney", "Black Friday deve movimentar bilhões em ofertas", [
      "economia",
    ]),
  ];
  assert.deepEqual(detectBreaking(pool, {}, NOW), []);
  assert.equal(pool.filter(isBreaking).length, 0);
});

test("a polysemous word and an idiom do not make an event", () => {
  // 2026-11-13: "Fazenda" (ministry, reality show) plus "abre o jogo" (idiom).
  const pool = [
    story(
      "g1 · Política",
      "Futuro ministro da Fazenda: veja quem são os cotados e o que está em jogo",
      ["politica-sociedade"],
      { publisherGroup: "Globo" },
    ),
    story(
      "g1 · Economia",
      "Futuro ministro da Fazenda: veja quem são os cotados e o que está em jogo",
      ["economia"],
      { publisherGroup: "Globo" },
    ),
    story(
      "Pipoca Moderna",
      "Murilo deixa A Fazenda 18 na Roça mais acirrada e votada da temporada",
      ["entretenimento"],
    ),
    story("Exame", "Quem saiu de 'A Fazenda 18'? Roça tem disputa apertada", [
      "economia",
    ]),
    story(
      "Seu Dinheiro",
      "FII XPML11 prepara corte nos dividendos e gestor abre o jogo",
      ["economia"],
    ),
    story(
      "Trivela",
      "Gyokeres minimiza críticas e abre o jogo sobre futuro no Arsenal",
      ["futebol"],
    ),
  ];
  assert.deepEqual(detectBreaking(pool, {}, NOW), []);
});

test("parseBatch rescales a 0-1 batch and approves what would have been below-score", async () => {
  const { parseBatch } = await import("../src/services/ollama.mjs");
  const { categories, config } = await import("../src/config.mjs");
  const slug = categories[0].slug;
  const batch = [1, 2, 3].map((n) => ({
    id: n,
    originalTitle: `Matéria ${n}`,
    excerpt: "Texto da matéria.",
    focus: [],
    strictFocus: false,
  }));
  const rows = [
    { id: 1, category: slug, score: 0.99, headline: "A", summary: "A." },
    { id: 2, category: slug, score: 0.87, headline: "B", summary: "B." },
    { id: 3, category: slug, score: 0.85, headline: "C", summary: "C." },
  ];
  const result = parseBatch({ items: rows }, batch);
  assert.equal(result.approved.length, 3);
  assert.equal(result.stats.belowScore, 0);
  assert.ok(result.approved.every((item) => item.score >= config.llmMinScore));
  assert.equal(result.approved[0].score, 9.9);
});

test("parseBatch drops an unsupported sports label back to the source desk", async () => {
  const { parseBatch } = await import("../src/services/ollama.mjs");
  const { categories } = await import("../src/config.mjs");
  const sports = categories.find((item) => item.slug === "esportes");
  const desk = categories.find(
    (item) => !["esportes", "futebol"].includes(item.slug),
  );
  if (!sports || !desk) return; // taxonomy without a sports desk
  const batch = [
    {
      id: 1,
      originalTitle: "Quanto custaria o iPhone 5C hoje? Veja o preço",
      excerpt: "Modelo lançado em 2013 pela Apple.",
      focus: [desk.slug],
      strictFocus: false,
    },
  ];
  const result = parseBatch(
    {
      items: [
        {
          id: 1,
          category: "esportes",
          score: 6.5,
          headline: "x",
          summary: "y.",
        },
      ],
    },
    batch,
  );
  assert.equal(result.approved[0].category, desk.slug);
});
