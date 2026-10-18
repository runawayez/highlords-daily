import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "../src/config.mjs";
import { invalidCopyField } from "../src/editorial/copy-quality.mjs";
import { enforceCopyProvenance } from "../src/editorial/provenance.mjs";
import { validateNewsletterContract } from "../src/editorial/edition.mjs";
import { recoverLocalizedCopy } from "../src/services/localized-copy.mjs";
import { bundledSources } from "../src/sources/catalog.mjs";
import { fetchAllFeeds } from "../src/services/rss.mjs";
import {
  canonicalImageKey,
  discoverPageImageCandidates,
  inspectImageBuffer,
} from "../src/services/image-quality.mjs";
import semanticReview from "../plugins/10-semantic-editorial-review.plugin.mjs";

const article = (overrides = {}) => ({
  id: 1,
  language: "en",
  originalTitle: "New compiler improves performance",
  excerpt:
    "The new compiler reduces memory usage and improves performance for developers.",
  headline: "string",
  summary: "string",
  category: "ia-desenvolvimento",
  ...overrides,
});

test("literal schema placeholders are repaired from source and cannot pass the final contract", async () => {
  for (const value of [
    "string",
    " string ",
    "null",
    "undefined",
    "",
    "...",
    "Lorem ipsum dolor sit amet",
  ])
    assert.equal(invalidCopyField(value), true);
  assert.equal(
    invalidCopyField("Strings em JavaScript: como funcionam"),
    false,
  );
  const source = article({
    language: "pt-BR",
    originalTitle: "Compilador reduz o consumo de memória",
    excerpt:
      "A ferramenta melhora o desempenho e reduz o consumo de memória dos programas.",
  });
  const repaired = enforceCopyProvenance(source, "pt-BR");
  assert.equal(repaired.headline, source.originalTitle);
  assert.equal(repaired.summary, source.excerpt);
  assert.ok(
    validateNewsletterContract({
      lead: source,
      sections: [],
      sectionOrder: [],
    }).errors.includes("invalid-copy:1"),
  );
  let calls = 0;
  assert.equal(
    await recoverLocalizedCopy(article(), {
      language: "pt-BR",
      cache: null,
      request: async () => {
        calls++;
        return {
          language: "pt-BR",
          headline: "string",
          summary: "string",
          tags: [],
        };
      },
    }),
    null,
  );
  assert.equal(calls, 2);
});

test("setup source identities describe publishers rather than the reader's residence", () => {
  const sources = bundledSources();
  for (const name of [
    "The Verge",
    "Hacker News",
    "Ars Technica",
    "TechCrunch",
    "GitHub Blog",
  ]) {
    const feed = sources.find((source) => source.name === name);
    assert.ok(feed, name);
    assert.equal(feed.language, "en-US", name);
    assert.equal(feed.country, "US", name);
  }
  assert.equal(
    sources.find((source) => source.name === "Canaltech").language,
    "pt-BR",
  );
});

test("independent semantic review sees content only, corrects anchored keep rows and drops missing decisions", async () => {
  const previousFetch = globalThis.fetch,
    previousCache = config.analysisCacheDays;
  config.analysisCacheDays = 0;
  globalThis.fetch = async (_url, options) => {
    const query = JSON.parse(options.body);
    const input = JSON.parse(query.messages[1].content);
    assert.equal(input.length, 3);
    for (const row of input)
      for (const key of [
        "source",
        "focus",
        "strictFocus",
        "currentCategory",
        "score",
      ])
        assert.equal(key in row, false, key);
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            items: [
              {
                id: 1,
                action: "keep",
                category: "entretenimento",
                confidence: 0.96,
                reason: "TV series, not a game.",
              },
              {
                id: 2,
                action: "reject",
                category: null,
                confidence: 0.99,
                reason: "Affiliate shopping promotion.",
              },
            ],
          }),
        },
      }),
    );
  };
  try {
    const result = await semanticReview.afterAnalyze({
      articles: [
        article({
          id: 1,
          category: "games",
          originalTitle:
            "VisionQuest apresenta vilão que usa tecnologia para caçar herói",
          excerpt: "A série de televisão estreou no Disney+.",
        }),
        article({
          id: 2,
          category: "clima-futuro",
          originalTitle: "Os melhores notebooks gamer em promoção na Amazon",
        }),
        article({ id: 3, originalTitle: "Music interview about minigolf" }),
      ],
    });
    assert.equal(result.articles.length, 1);
    assert.equal(result.articles[0].category, "entretenimento");
  } finally {
    globalThis.fetch = previousFetch;
    config.analysisCacheDays = previousCache;
  }
});

test("semantic transport failure never silently approves unreviewed stories", async () => {
  const previousFetch = globalThis.fetch,
    previousCache = config.analysisCacheDays;
  config.analysisCacheDays = 0;
  globalThis.fetch = async () => {
    throw new Error("offline fixture");
  };
  try {
    assert.deepEqual(
      (await semanticReview.afterAnalyze({ articles: [article()] })).articles,
      [],
    );
  } finally {
    globalThis.fetch = previousFetch;
    config.analysisCacheDays = previousCache;
  }
});

test("ordinary collection respects the candidate cap without probing rejected-candidate images", async () => {
  const previousFetch = globalThis.fetch;
  const previous = {
    requireImages: config.requireImages,
    historyEnabled: config.historyEnabled,
    maxCandidates: config.maxCandidates,
  };
  Object.assign(config, {
    requireImages: false,
    historyEnabled: false,
    maxCandidates: 2,
  });
  const origin = `https://${randomUUID()}.example`;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(String(url), `${origin}/rss`);
    return new Response(
      `<rss version="2.0"><channel><title>News</title><link>${origin}</link><description>News</description>${[1, 2, 3, 4].map((id) => `<item><title>Notícia ${id}</title><guid>${id}</guid><link>${origin}/${id}</link><pubDate>${new Date().toUTCString()}</pubDate><description>Texto da notícia.</description><enclosure url="${origin}/${id}.jpg" type="image/jpeg" /></item>`).join("")}</channel></rss>`,
      { headers: { "content-type": "application/rss+xml" } },
    );
  };
  try {
    const result = await fetchAllFeeds(() => {}, [
      {
        name: "Fixture",
        url: `${origin}/rss`,
        language: "pt-BR",
        imageMode: "auto",
        focus: [],
      },
    ]);
    assert.equal(result.articles.length, 2);
    assert.equal(calls, 1);
    assert.ok(result.articles.every((story) => story.imageUrl));
  } finally {
    globalThis.fetch = previousFetch;
    Object.assign(config, previous);
  }
});

test("large article HTML retains early Open Graph images and decodes signed query separators", async () => {
  const previousFetch = globalThis.fetch;
  const origin = `https://${randomUUID()}.example`;
  globalThis.fetch = async () =>
    new Response(
      `<meta property="og:image" content="${origin}/photo.jpg?id=story&amp;token=abc"><img src="/placeholder.jpg" data-src="/editorial.jpg">${" ".repeat(1_600_000)}`,
      { headers: { "content-type": "text/html", "content-length": "1601000" } },
    );
  try {
    const candidates = await discoverPageImageCandidates({
      link: `${origin}/article`,
      originalTitle: "Editorial",
    });
    assert.ok(
      candidates.some(
        (item) => item.url === `${origin}/photo.jpg?id=story&token=abc`,
      ),
    );
    assert.ok(
      candidates.some((item) => item.url === `${origin}/editorial.jpg`),
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("compressed photos pass quality checks while placeholders and tiny images remain blocked", () => {
  const png = Buffer.alloc(10000, 73);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(675, 20);
  assert.equal(
    inspectImageBuffer(png, "image/png", "https://cdn.example/photo.png").ok,
    true,
  );
  assert.equal(
    inspectImageBuffer(png, "image/png", "https://cdn.example/placeholder.png")
      .ok,
    false,
  );
  png.writeUInt32BE(80, 16);
  png.writeUInt32BE(80, 20);
  assert.equal(
    inspectImageBuffer(png, "image/png", "https://cdn.example/photo.png").ok,
    false,
  );
  assert.notEqual(
    canonicalImageKey("https://cdn.example/image?id=one&w=800"),
    canonicalImageKey("https://cdn.example/image?id=two&w=800"),
  );
  assert.equal(
    canonicalImageKey("https://cdn.example/image?id=one&w=800"),
    canonicalImageKey("https://cdn.example/image?id=one&w=1200"),
  );
});
