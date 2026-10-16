import test from "node:test";
import assert from "node:assert/strict";
import { applyCopyIntegrity } from "../plugins/09-copy-integrity.plugin.mjs";
import { sourceSummary } from "../src/editorial/summary.mjs";

test("source summaries select complete sentences and remove standalone promotional calls", () => {
  const first =
    "O fabricante investiga relatos de alteração na cor do aparelho.";
  const detail =
    "Os testes ainda não identificaram a causa do problema relatado pelos usuários.";
  const source = `${first} Veja as melhores promoções de hoje no WhatsApp do CT Ofertas. ${detail} ${detail.repeat(8)}`;
  const result = sourceSummary(source, "pt-BR");
  assert.ok(result.startsWith(first));
  assert.ok(result.includes(detail));
  assert.ok(result.length <= 420);
  assert.ok(result.endsWith("."));
  assert.ok(!result.includes("WhatsApp"));
  const article = applyCopyIntegrity({ language: "pt", excerpt: source }, "pt");
  assert.equal(article.excerpt, source, "source evidence is retained");
  assert.equal(article.summary, result);
  const news = "Veja como identificar golpes no WhatsApp e proteger sua conta.";
  assert.equal(
    sourceSummary(news, "pt-BR"),
    news,
    "news about a promotional platform is not boilerplate",
  );
});

test("short sources are never padded and a long sentence is never cut mid-fact", () => {
  assert.equal(sourceSummary("Nota curta.", "pt"), "Nota curta.");
  const sentence = "Contexto ".repeat(65) + "confirmado.";
  assert.equal(sourceSummary(sentence, "pt"), sentence);
  assert.equal(sourceSummary("", "invalid_locale"), "");
  assert.equal(sourceSummary("Uma frase.", "invalid_locale"), "Uma frase.");
});

test("same-language stories cannot render copy borrowed from another batch item", () => {
  const article = applyCopyIntegrity(
    {
      id: 1,
      language: "pt-BR",
      originalTitle: "Verstappen vence prova após duelo intenso na Fórmula 1",
      excerpt:
        "O piloto da Red Bull venceu a corrida após uma disputa apertada nas voltas finais.",
      headline: "Convey: novo cliente de e-mail para Linux baseado em GNOME",
      summary:
        "Convey é um fork moderno do Geary, adaptado para GTK4 e Libadwaita.",
      tags: ["convey", "linux", "gnome", "red bull"],
    },
    "pt-BR",
  );

  assert.equal(
    article.headline,
    "Verstappen vence prova após duelo intenso na Fórmula 1",
  );
  assert.equal(
    article.summary,
    "O piloto da Red Bull venceu a corrida após uma disputa apertada nas voltas finais.",
  );
  assert.deepEqual(article.tags, ["red bull"]);
  assert.equal(article.copyIntegrity, "source-preserved");
});

test("foreign-language stories keep localized AI copy for the multilingual engine", () => {
  const article = {
    id: 2,
    language: "en-US",
    originalTitle: "New Linux mail client launches",
    excerpt: "A new GNOME mail client was released.",
    headline: "Novo cliente de e-mail para Linux é lançado",
    summary: "Um novo cliente de e-mail para GNOME foi lançado.",
    tags: ["linux", "gnome"],
  };

  assert.deepEqual(applyCopyIntegrity(article, "pt-BR"), article);
});
