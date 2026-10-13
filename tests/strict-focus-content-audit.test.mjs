import test from "node:test";
import assert from "node:assert/strict";
import { applyStrictFocusAudit } from "../plugins/08-strict-focus-content-audit.plugin.mjs";

function article(id, focus, title) {
  return {
    id,
    originalTitle: title,
    excerpt: title,
    category: focus[0],
    strictFocus: true,
    focus,
  };
}

test("strict focus limits a source but never forces unrelated story content", () => {
  const input = [
    article(
      1,
      ["politica-sociedade"],
      "Quem é a maior joia da Premier League que fechou com agência de Vini Jr e Endrick",
    ),
    article(
      2,
      ["esportes"],
      "Confusão na A Fazenda 18 após discussão sobre coleta de lixo",
    ),
    article(
      3,
      ["esportes"],
      "Arrascaeta retorna ao CT após cirurgia no punho esquerdo",
    ),
  ];

  const result = applyStrictFocusAudit(input, [
    { id: 1, category: "esportes", confidence: 0.99 },
    { id: 2, category: "entretenimento", confidence: 0.98 },
    { id: 3, category: "esportes", confidence: 0.97 },
  ]);

  assert.deepEqual(
    result.articles.map((item) => item.id),
    [3],
  );
  assert.equal(result.stats.checked, 3);
  assert.equal(result.stats.rejected, 2);
  assert.equal(result.stats.kept, 1);
});

test("strict focus audit keeps low-confidence disagreements instead of over-filtering", () => {
  const input = [
    article(
      10,
      ["economia"],
      "Concurso público oferece salários acima de R$ 32 mil",
    ),
  ];

  const result = applyStrictFocusAudit(input, [
    { id: 10, category: "politica-sociedade", confidence: 0.55 },
  ]);

  assert.equal(result.articles.length, 1);
  assert.equal(result.stats.rejected, 0);
  assert.equal(result.stats.uncertain, 1);
});
