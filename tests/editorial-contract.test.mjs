import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNewsletter,
  validateNewsletterContract,
} from "../src/editorial/edition.mjs";
import { categories } from "../src/config.mjs";

function story(id, category, score, source = `source-${id}`) {
  return {
    id,
    category,
    score,
    sectionScore: score,
    frontPageScore: score,
    source,
    publisherGroup: source,
    publishedAt: new Date(Date.now() - id * 60000).toISOString(),
    originalTitle: `Story ${id}`,
    headline: `Story ${id}`,
    summary: `Summary ${id}`,
    topicKey: `topic-${id}`,
    tags: [],
  };
}

test("taxonomy owns section names and the lead never repeats in its section", () => {
  const [first, second, third] = categories.slice(0, 3);
  assert.ok(first && second && third, "bundled taxonomy must expose categories");

  const articles = [
    story(1, first.slug, 9),
    story(2, first.slug, 7),
    story(3, second.slug, 8),
    story(4, third.slug, 6),
  ];
  const edition = normalizeNewsletter(
    {
      leadId: 1,
      topStoryIds: [3, 4],
      sectionTitles: {
        [first.slug]: "Futebol",
        [second.slug]: "Futebol",
      },
      sections: {
        [first.slug]: [1, 2],
        [second.slug]: [3],
        [third.slug]: [4],
      },
    },
    articles,
    "2026-10-08",
  );

  assert.equal(edition.lead.id, 1);
  assert.ok(
    edition.sections.every((section) =>
      section.articles.every((article) => article.id !== edition.lead.id),
    ),
  );
  for (const section of edition.sections) {
    assert.equal(
      section.name,
      categories.find((category) => category.slug === section.slug).name,
    );
  }
  assert.equal(
    new Set(edition.sections.map((section) => section.name)).size,
    edition.sections.length,
  );
  assert.equal(validateNewsletterContract(edition).ok, true);
});

test("coverage planner gives each available category a first slot before second slots", () => {
  const selectedCategories = categories.slice(0, 4);
  assert.equal(selectedCategories.length, 4);
  const articles = [];
  let id = 1;
  for (const category of selectedCategories) {
    articles.push(story(id++, category.slug, 8));
    articles.push(story(id++, category.slug, 7));
  }

  const lead = articles[0];
  const edition = normalizeNewsletter(
    { leadId: lead.id, sections: {} },
    articles,
    "2026-10-08",
  );

  const visible = new Set(edition.sections.map((section) => section.slug));
  // The lead consumes one story from its category, but the second candidate
  // backfills that section. Every category with a selectable candidate survives.
  for (const category of selectedCategories)
    assert.ok(visible.has(category.slug));
  assert.equal(
    edition.stats.coverage.visible,
    edition.stats.coverage.selectableCategories,
  );
});

test("quality gate detects post-normalization taxonomy drift", () => {
  const [first, second] = categories.slice(0, 2);
  const edition = normalizeNewsletter(
    { leadId: 1, sections: {} },
    [
      story(1, first.slug, 9),
      story(2, first.slug, 7),
      story(3, second.slug, 8),
    ],
    "2026-10-08",
  );
  const broken = structuredClone(edition);
  broken.sections[0].name = "Futebol";
  const result = validateNewsletterContract(broken);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) =>
      error.startsWith("noncanonical-section-name:"),
    ),
  );
});
