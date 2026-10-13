import test from "node:test";
import assert from "node:assert/strict";
import { applyCopyIntegrity } from "../plugins/09-copy-integrity.plugin.mjs";

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
