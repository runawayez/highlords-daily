import test from "node:test";
import assert from "node:assert/strict";
import { renderNewsletterHtml } from "../src/template.mjs";
import { designPreview } from "./fixtures/design-preview.mjs";

test("editorial renderer keeps the approved visual language and source links without exposing scores", () => {
  const edition = designPreview();
  edition.previewNotice = '<script>alert("preview")</script>';
  edition.lead.headline = "A".repeat(200);
  edition.lead.score = 9.73;
  const html = renderNewsletterHtml(edition);
  assert.ok(html.includes('data-design="editorial-v2"'));
  assert.ok(html.includes('data-edition-date="2026-10-15"'));
  assert.ok(html.includes("long-headline"));
  assert.ok(
    html.indexOf('class="brand-tag"') < html.indexOf('class="brand-name"'),
  );
  assert.ok(
    html.indexOf('<nav class="index">') < html.indexOf('class="lead-wrap"'),
  );
  assert.ok(html.includes('href="https://example.org/layout-preview"'));
  assert.ok(html.includes('class="pdf-page') || html.includes(".pdf-page{"));
  assert.ok(!html.includes("9.73"));
  assert.ok(!html.includes("<script>alert("));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("non-demo editions do not acquire illustrative notices or fabricated copy", () => {
  const edition = designPreview();
  delete edition.previewNotice;
  edition.lead.headline = "A headline supplied by the edition";
  const html = renderNewsletterHtml(edition);
  assert.ok(html.includes("A headline supplied by the edition"));
  assert.ok(!html.includes('<p class="preview-notice">'));
  assert.ok(!html.includes("A próxima disputa"));
});
