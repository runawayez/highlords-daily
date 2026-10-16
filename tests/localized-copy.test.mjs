import test from "node:test";
import assert from "node:assert/strict";
import {
  assessCopy,
  enforceCopyProvenance,
} from "../src/editorial/provenance.mjs";
import {
  recoverLocalizedCopy,
  needsCopyLocalization,
} from "../src/services/localized-copy.mjs";
import { validateNewsletterContract } from "../src/editorial/edition.mjs";

const original = () => ({
  id: 1,
  language: "en",
  originalTitle: "GitHub availability report: September 2026",
  excerpt:
    "Our last update covered content through August. We did not publish another in September while other public content addressed the August 17 outage. This edition covers progress over the past two months.",
  headline: "Relatório do GitHub em setembro de 2026",
  summary: "O relatório cobre os últimos 2 meses.",
  tags: ["GitHub"],
});
const translated = () => ({
  language: "pt-BR",
  headline: "Relatório de disponibilidade do GitHub: setembro de 2026",
  summary:
    "O GitHub apresenta os avanços dos últimos dois meses e contextualiza a indisponibilidade de 17 de agosto.",
  tags: ["GitHub", "disponibilidade"],
});
const backed = () => enforceCopyProvenance(original(), "pt-BR");

test("September before a year is not interpreted as the R$ currency prefix", () => {
  const article = { ...original(), ...translated(), language: "en" };
  assert.deepEqual(assessCopy(article).unsupportedNumbers, []);
  assert.equal(
    enforceCopyProvenance(article, "pt-BR").provenance.action,
    "retained",
  );
  const reais = {
    ...article,
    originalTitle: "Product costs R$25",
    excerpt: "Costs R$25.",
    headline: "Produto custa R$50",
    summary: "O custo é R$50.",
  };
  assert.ok(assessCopy(reais).unsupportedNumbers.includes("r$50"));
});

test("numeric fallback recovers a single English source into Portuguese instead of publishing English", async () => {
  const input = backed();
  assert.equal(input.provenance.languageFallback, true);
  const result = await recoverLocalizedCopy(input, {
    language: "pt-BR",
    cache: null,
    request: async (system, user, options) => {
      assert.ok(system.includes("pt-BR"));
      assert.equal(JSON.parse(user).title, input.originalTitle);
      assert.deepEqual(options.schema.properties.language.enum, ["pt-BR"]);
      return translated();
    },
  });
  assert.equal(result.summary, translated().summary);
  assert.equal(
    result.language,
    "en",
    "source language remains source metadata",
  );
  assert.equal(result.outputLanguage, "pt-BR");
  assert.equal(result.provenance.languageFallback, false);
  assert.equal(result.provenance.action, "localized-source-recovery");
  assert.ok(result.provenance.originalIssues.includes("2"));
  assert.equal(result.originalTitle, input.originalTitle);
  assert.equal(result.excerpt, input.excerpt);
});

test("unsupported numbers get one bounded retry, and failures never return untranslated fallback", async () => {
  let calls = 0;
  const result = await recoverLocalizedCopy(backed(), {
    language: "pt-BR",
    cache: null,
    request: async () =>
      ++calls === 1
        ? { ...translated(), summary: "Houve 99 falhas." }
        : translated(),
  });
  assert.equal(calls, 2);
  assert.ok(result);
  calls = 0;
  assert.equal(
    await recoverLocalizedCopy(backed(), {
      language: "pt-BR",
      cache: null,
      request: async () => {
        calls++;
        throw new Error("offline");
      },
    }),
    null,
  );
  assert.equal(calls, 2);
  const rejected = validateNewsletterContract({
    lead: backed(),
    sections: [],
    sectionOrder: [],
  });
  assert.ok(rejected.errors.includes("unlocalized-source-fallback:1"));
});

test("an untranslated copy cannot pass by merely claiming the configured language", async () => {
  const input = backed();
  assert.equal(
    await recoverLocalizedCopy(input, {
      language: "pt-BR",
      cache: null,
      request: async () => ({
        language: "pt-BR",
        headline: input.originalTitle,
        summary: input.excerpt,
        tags: [],
      }),
    }),
    null,
  );
  assert.equal(
    await recoverLocalizedCopy(input, {
      language: "pt-BR",
      cache: null,
      request: async () => ({
        language: "pt-BR",
        headline: input.originalTitle,
        summary: "Our last update covered content through August.",
        tags: [],
      }),
    }),
    null,
  );
  assert.equal(
    await recoverLocalizedCopy(input, {
      language: "pt-BR",
      cache: null,
      request: async () => ({ ...translated(), language: "en" }),
    }),
    null,
  );
});

test("valid localized and same-language stories do not require an extra model call", async () => {
  const request = async () => {
    throw new Error("must not call");
  };
  const pt = {
    ...original(),
    language: "pt-BR",
    headline: "Uma matéria em português",
    summary: "Um resumo em português.",
  };
  assert.equal(
    await recoverLocalizedCopy(pt, { language: "pt-BR", cache: null, request }),
    pt,
  );
  const foreign = {
    ...original(),
    ...translated(),
    language: "en",
    summary: translated().summary,
  };
  assert.equal(needsCopyLocalization(foreign, "pt-BR"), false);
  assert.equal(
    await recoverLocalizedCopy(foreign, {
      language: "pt-BR",
      cache: null,
      request,
    }),
    foreign,
  );
});

test("recovered translations are reused and invalid cache entries are revalidated", async () => {
  let saved,
    calls = 0;
  const cache = {
    get: async () => saved,
    set: async (namespace, key, value) => {
      saved = value;
    },
  };
  const options = {
    language: "pt-BR",
    cache,
    request: async () => {
      calls++;
      return translated();
    },
  };
  await recoverLocalizedCopy(backed(), options);
  await recoverLocalizedCopy({ ...backed(), id: 9 }, options);
  assert.equal(calls, 1);
  saved = { ...translated(), summary: "O serviço teve 999 falhas." };
  await recoverLocalizedCopy(backed(), options);
  assert.equal(calls, 2);
  const unavailable = {
    get: async () => {
      throw new Error("read-only");
    },
    set: async () => {
      throw new Error("read-only");
    },
  };
  assert.ok(
    await recoverLocalizedCopy(backed(), { ...options, cache: unavailable }),
  );
});
