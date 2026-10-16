import test from "node:test";
import assert from "node:assert/strict";
import { cleanSourceText, limitCopy } from "../src/editorial/source-text.mjs";
import { sourceSummary } from "../src/editorial/summary.mjs";
import { enforceCopyProvenance } from "../src/editorial/provenance.mjs";
import {
  articleSimilarity,
  deduplicateArticles,
} from "../src/services/memory.mjs";
import { matchingSourceEvent } from "../src/editorial/event-match.mjs";

test("RSS cleanup separates paragraphs and removes related links, headings and inline CTAs", () => {
  const html =
    "<h2>Causa da morte é divulgada</h2><p>A fonte descreveu o acontecimento.</p><p>📱 Veja as melhores promoções de hoje no WhatsApp do CT Ofertas Ainda não há uma explicação confirmada.</p><p>Notícias relacionadas: Outra notícia.</p><p>O contexto continua aqui.</p>";
  assert.equal(
    cleanSourceText(html),
    "A fonte descreveu o acontecimento. Ainda não há uma explicação confirmada. O contexto continua aqui.",
  );
  assert.equal(
    cleanSourceText(
      "A proposta foi aprovada. 🗒️ Tem alguma sugestão de reportagem? Mande para o g1 A mudança será gradual.",
    ),
    "A proposta foi aprovada. A mudança será gradual.",
  );
  assert.equal(
    cleanSourceText(
      "Fato confirmado. Notícias relacionadas: Primeiro link. Segundo link.",
    ),
    "Fato confirmado.",
  );
  assert.equal(
    cleanSourceText("<p>Um texto.</p><p>Outro texto &amp; &#x1F4F0;.</p>"),
    "Um texto. Outro texto & 📰.",
  );
  assert.equal(
    cleanSourceText("Veja como proteger sua conta no WhatsApp."),
    "Veja como proteger sua conta no WhatsApp.",
  );
  assert.equal(
    cleanSourceText("Ci&ecirc;ncia, sa&uacute;de e &alpha;."),
    "Ciência, saúde e α.",
  );
});

test("copy limits prefer sentences and never cut Portuguese words or Unicode surrogate pairs", () => {
  assert.equal(
    limitCopy(
      "Uma frase completa. Outra frase que ultrapassa o limite.",
      25,
      "pt",
    ),
    "Uma frase completa.",
  );
  assert.equal(
    limitCopy("Um trecho sem pontuação com palavras compridas", 30, "pt"),
    "Um trecho sem pontuação com…",
  );
  const text = "😀".repeat(40);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(limitCopy(text, 20)));
  assert.ok(limitCopy("東京の科学研究".repeat(10), 30, "ja").length <= 30);
});

test("source integrity and numeric-conflict fallback both use complete source copy", () => {
  const excerpt =
    "A fonte informou que o produto custa $5. " +
    "A investigação continua sem conclusão sobre a causa do problema. ".repeat(
      30,
    );
  const bounded = limitCopy(excerpt, 1400, "pt");
  assert.ok(bounded.endsWith("."));
  const fallback = enforceCopyProvenance(
    {
      originalTitle: "Produto custa $5",
      excerpt: bounded,
      summary: "Produto custa $100",
      headline: "Custa $100",
      language: "pt",
    },
    "pt",
  );
  assert.equal(fallback.summary, sourceSummary(bounded, "pt"));
  assert.ok(fallback.summary.length <= 420);
  assert.ok(fallback.summary.endsWith("."));
  assert.equal(fallback.provenance.source.excerpt, bounded);
});

const story = (id, category, originalTitle, extra = {}) => ({
  id,
  stableId: `event-${id}`,
  category,
  originalTitle,
  headline: originalTitle,
  link: `https://example.org/${id}`,
  language: "pt",
  score: 8,
  publishedAt: "2026-10-15T12:00:00Z",
  ...extra,
});
test("same event is deduplicated across Games/eSports despite title and topic-key differences", () => {
  const left = story(
    1,
    "games",
    "League of Legends Classic já tem data para chegar ao fim",
    { topicKey: "league-of-legends-fim", score: 7 },
  );
  const right = story(
    2,
    "esports",
    "LoL Classic: Riot anuncia o encerramento do modo após queda na quantidade de jogadores ativos",
    { topicKey: "riot-encerramento-classic" },
  );
  assert.ok(matchingSourceEvent(left, right));
  assert.ok(articleSimilarity(left, right) >= 0.9);
  const result = deduplicateArticles([left, right]);
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].category, "esports");
  assert.equal(result.articles[0].relatedCoverage[0].link, left.link);
});

test("event matching does not collapse other games, new developments or conflicting product versions", () => {
  for (const [left, right] of [
    [
      "Riot Games anuncia encerramento de VALORANT",
      "Riot Games anuncia encerramento de TFT",
    ],
    [
      "Riot Games anuncia encerramento de ARAM",
      "Riot Games anuncia encerramento de LoL Classic",
    ],
    [
      "LoL Classic já tem data para chegar ao fim",
      "LoL Classic terá nova atualização em janeiro",
    ],
    ["Apple iPhone 18 recebe aprovação", "Apple iPhone 19 recebe aprovação"],
    ["LoL Classic terá encerramento", "Riot nega encerramento de LoL Classic"],
  ])
    assert.equal(
      matchingSourceEvent(story(1, "games", left), story(2, "esports", right)),
      false,
    );
  assert.equal(
    matchingSourceEvent(
      story(1, "games", "LoL Classic será encerrado"),
      story(2, "games", "LoL Classic terá encerramento", {
        publishedAt: "2026-10-20T12:00:00Z",
      }),
    ),
    false,
  );
});

test("different game/model evidence overrides generic lexical or model-topic similarity", () => {
  for (const [left, right] of [
    [
      "Riot Games anuncia encerramento de VALORANT",
      "Riot Games anuncia encerramento de TFT",
    ],
    [
      "Riot Games anuncia encerramento de ARAM",
      "Riot Games anuncia encerramento de LoL Classic",
    ],
    ["Apple iPhone 18 recebe aprovação", "Apple iPhone 19 recebe aprovação"],
    ["LoL Classic terá encerramento", "Riot nega encerramento de LoL Classic"],
  ]) {
    const a = story(1, "games", left, { topicKey: "generic-topic" });
    const b = story(2, "esports", right, { topicKey: "generic-topic" });
    assert.equal(
      deduplicateArticles([a, b]).articles.length,
      2,
      `${left} / ${right}`,
    );
  }
});
