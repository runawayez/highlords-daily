import test from "node:test";
import assert from "node:assert/strict";
import qualityGate from "../plugins/99-editorial-quality-gate.plugin.mjs";

function story(id, category) {
  return {
    id,
    category,
    headline: `Story ${id}`,
    summary: `Summary ${id}`,
    source: `Source ${id}`,
  };
}

function edition({ omitPolitics = false } = {}) {
  const sections = [
    {
      slug: "ia-desenvolvimento",
      name: "IA & Desenvolvimento",
      articles: [story(2, "ia-desenvolvimento")],
    },
    {
      slug: "games",
      name: "Games",
      articles: [story(3, "games")],
    },
    {
      slug: "economia",
      name: "Economia",
      articles: [story(4, "economia")],
    },
    ...(!omitPolitics
      ? [
          {
            slug: "politica-sociedade",
            name: "Política & Sociedade",
            articles: [story(5, "politica-sociedade")],
          },
        ]
      : []),
  ];

  const optionalMissing = [
    "esports",
    "entretenimento",
    "esportes",
    "ciencia-saude",
    "clima-futuro",
  ].map((slug) => ({
    slug,
    name: slug,
    reason: "no-candidate-after-analysis",
  }));

  const missing = omitPolitics
    ? [
        {
          slug: "politica-sociedade",
          name: "Política & Sociedade",
          reason: "no-candidate-after-analysis",
        },
        ...optionalMissing,
      ]
    : optionalMissing;

  return {
    lead: story(1, "tecnologia"),
    topStories: [],
    sections,
    sectionOrder: sections.map((section) => section.slug),
    stats: {
      coverage: {
        selectableCategories: sections.length,
        visible: sections.length,
        missing,
      },
    },
  };
}

test("daily quality gate allows optional sections to stay out when the day is weak", () => {
  const input = edition();
  const result = qualityGate.beforeRender({ edition: input });
  assert.equal(result.edition.stats.qualityGate.passed, true);
  assert.equal(result.edition.stats.qualityGate.requiredCategories, 5);
  assert.equal(result.edition.stats.qualityGate.requiredCategoriesCovered, 5);
  assert.equal(
    result.edition.stats.qualityGate.optionalMissingCategories.length,
    5,
  );
});

test("daily quality gate still blocks a missing core section", () => {
  assert.throws(
    () => qualityGate.beforeRender({ edition: edition({ omitPolitics: true }) }),
    /Editorial coverage incomplete: Política & Sociedade/,
  );
});
