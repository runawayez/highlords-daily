import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";
import { stringify as yaml } from "yaml";
import { atomicWrite } from "../utils/storage.mjs";
import { envValue } from "../utils/env.mjs";
import { mapLimit } from "../utils/concurrency.mjs";
import { findBrowser } from "../services/browser.mjs";
import {
  buildSetupPlan,
  languages,
  countries,
  interests,
  countryName,
  resolveCountry,
} from "./plan.mjs";
import { checkSetupSource } from "./source-check.mjs";

export class SetupCancelled extends Error {}
export function numberedChoices(answer, length, { all = false } = {}) {
  const text = String(answer).trim();
  if (all && text === "0") return Array.from({ length }, (_, i) => i);
  if (!/^\d+(?:\s*[,; ]\s*\d+)*$/.test(text)) return null;
  const result = [...new Set(text.split(/[,;\s]+/).map(Number))];
  return result.length && result.every((n) => n >= 1 && n <= length)
    ? result.map((n) => n - 1)
    : null;
}
const messages = {
  title: [
    "Vamos configurar seu jornal. Escolha pelos números; Enter aceita a sugestão. Não é preciso editar arquivos.",
    "Let's set up your newspaper. Choose numbers; Enter accepts the suggestion. No file editing needed.",
  ],
  existing: [
    "Você já tem preferências salvas. O que deseja fazer?",
    "You already have saved preferences. What would you like to do?",
  ],
  replace: [
    "Alterar minhas preferências (uma cópia das anteriores será guardada)",
    "Change preferences (a backup will be kept)",
  ],
  keep: ["Manter minhas preferências e sair", "Keep preferences and exit"],
  invalid: [
    "Escolha um dos números mostrados.",
    "Choose one of the displayed numbers.",
  ],
  choose: ["Sua escolha", "Your choice"],
  output: [
    "Em qual idioma você quer ler o jornal?",
    "In which language would you like to read?",
  ],
  residence: ["Em qual país você mora?", "Which country do you live in?"],
  other: ["Outro país — escrever o nome", "Another country — type its name"],
  country: ["Escreva o nome do país", "Type the country's name"],
  unknown: [
    "Não reconheci esse país. Tente o nome completo.",
    "Country not recognized. Try its full name.",
  ],
  coverage: [
    "Quais lugares você quer acompanhar? Pode escolher vários, separados por vírgula (ex.: 1,2).",
    "Which places would you like to follow? Choose several with commas (e.g. 1,2).",
  ],
  topics: [
    "Quais assuntos te interessam? Separe os números por vírgula; 0 escolhe todos.",
    "Which subjects interest you? Separate numbers with commas; 0 selects all.",
  ],
  all: ["Todos os assuntos", "All subjects"],
  size: ["Como você prefere a edição?", "How much would you like to read?"],
  short: ["Rápida — poucos destaques", "Quick — a few highlights"],
  balanced: [
    "Equilibrada — recomendada para começar",
    "Balanced — recommended to start",
  ],
  complete: [
    "Mais completa — mais notícias e mais tempo para preparar",
    "More complete — more stories and preparation time",
  ],
  time: [
    "Qual horário deve determinar a data da edição?",
    "Which clock should determine the edition's date?",
  ],
  computer: [
    "O horário deste computador (recomendado)",
    "This computer's clock (recommended)",
  ],
  formats: [
    "Quais arquivos do jornal você quer gerar?",
    "Which newspaper files would you like?",
  ],
  html: [
    "Ler no navegador — sem gerar PDF",
    "Read in the browser — no PDF generation",
  ],
  pdf: [
    "Ler no navegador e salvar PDF — precisa de Chrome ou Edge",
    "Read in the browser and save PDF — Chrome or Edge required",
  ],
  noBrowser: [
    "Não encontrei Chrome, Chromium ou Edge. Você pode instalar um deles e configurar novamente depois.",
    "Chrome, Chromium or Edge was not found. You can install a browser and reconfigure later.",
  ],
  continueHtml: [
    "Continuar apenas com leitura no navegador?",
    "Continue with browser reading only?",
  ],
  yes: ["Sim", "Yes"],
  no: ["Não, configurar depois", "No, set up later"],
  summary: ["Confira suas preferências:", "Review your preferences:"],
  lives: ["Você mora em", "You live in"],
  reads: ["Idioma de leitura", "Reading language"],
  follows: ["Você quer acompanhar", "You want to follow"],
  subjects: ["Assuntos", "Subjects"],
  save: [
    "Posso verificar as fontes e salvar essas preferências?",
    "Check sources and save these preferences?",
  ],
  checking: [
    "Verificando as fontes de notícias. Isso pode levar alguns minutos...",
    "Checking news sources. This may take a few minutes...",
  ],
  progress: ["Fontes verificadas", "Sources checked"],
  none: [
    "Não encontrei fontes disponíveis para essas escolhas. Confira sua conexão e tente novamente; as preferências anteriores foram preservadas.",
    "No available sources were found. Check your connection and try again; previous preferences were preserved.",
  ],
  limited: [
    "Não encontrei fontes locais disponíveis para",
    "No available local sources were found for",
  ],
  limitedDetail: [
    "As fontes restantes podem trazer notícias internacionais, mas não garantem cobertura local desse país.",
    "Remaining sources may provide international news, but do not guarantee local coverage of this country.",
  ],
  proceed: [
    "Quer continuar com as fontes disponíveis?",
    "Continue with available sources?",
  ],
  ready: [
    "Pronto! Suas preferências foram salvas automaticamente.",
    "Ready! Your preferences have been saved automatically.",
  ],
  available: ["fontes disponíveis", "available sources"],
  next: [
    "As mudanças valem para as próximas edições; uma edição já gerada hoje será preservada. Para gerar o jornal, abra GERAR-DAILY.bat no Windows ou execute bash RUN-DAILY.sh no macOS/Linux. Para mudar suas preferências: CONFIGURAR-DAILY.bat ou bash RUN-DAILY.sh --setup-only.",
    "New preferences apply to future editions; an edition already generated today is preserved. Open GERAR-DAILY.bat on Windows or run bash RUN-DAILY.sh on macOS/Linux. Change preferences with CONFIGURAR-DAILY.bat or bash RUN-DAILY.sh --setup-only.",
  ],
  cancelled: [
    "Configuração cancelada. As preferências anteriores foram preservadas.",
    "Setup cancelled. Previous preferences were preserved.",
  ],
  interruption: [
    "A configuração foi interrompida. Abra o programa novamente para concluir.",
    "Setup was interrupted. Open the program again to finish.",
  ],
};
export async function runSetup({
  root = process.cwd(),
  ask,
  write = (text) => process.stdout.write(text),
  catalog,
  probe = checkSetupSource,
  browser = findBrowser,
  machineZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
} = {}) {
  let ui = "pt";
  const m = (key) => messages[key][ui === "pt" ? 0 : 1];
  const read = async (label, fallback = "") => {
    const a = await ask(`${label}${fallback ? ` [${fallback}]` : ""}: `);
    if (a == null) throw new SetupCancelled(m("interruption"));
    return String(a).trim() || fallback;
  };
  const choose = async (
    label,
    options,
    fallback = 1,
    multiple = false,
    all = false,
  ) => {
    write(`\n${label}\n`);
    if (all) write(`  0. ${m("all")}\n`);
    options.forEach((o, i) => write(`  ${i + 1}. ${o.label}\n`));
    while (true) {
      const result = numberedChoices(
        await read(m("choose"), String(fallback)),
        options.length,
        { all },
      );
      if (result && (multiple || result.length === 1))
        return multiple
          ? result.map((i) => options[i].value)
          : options[result[0]].value;
      write(`${m("invalid")}\n`);
    }
  };
  ui = await choose("Idioma do assistente / Setup language", [
    { value: "pt", label: "Português" },
    { value: "en", label: "English" },
  ]);
  write(`\nHighlords Daily\n${m("title")}\n`);
  const target = path.join(root, ".env");
  let original = null,
    previous = {};
  try {
    original = await fs.readFile(target, "utf8");
    previous = parseEnv(original);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const cancel = () => {
    write(`\n${m("cancelled")}\n`);
    return { cancelled: true };
  };
  const yesNo = () => [
    { value: true, label: m("yes") },
    { value: false, label: m("no") },
  ];
  if (
    original !== null &&
    (await choose(
      m("existing"),
      [
        { value: "change", label: m("replace") },
        { value: "keep", label: m("keep") },
      ],
      2,
    )) === "keep"
  )
    return cancel();
  const language = await choose(m("output"), languages, ui === "pt" ? 1 : 2);
  const countryOptions = countries
    .map((value) => ({ value, label: countryName(value, ui) }))
    .concat({ value: "OTHER", label: m("other") });
  const anotherCountry = async () => {
    while (true) {
      const code = resolveCountry(await read(m("country")), ui);
      if (code) return code;
      write(`${m("unknown")}\n`);
    }
  };
  let residence = await choose(
    m("residence"),
    countryOptions,
    ui === "pt" ? 1 : 2,
  );
  if (residence === "OTHER") residence = await anotherCountry();
  const coverageOptions = [...countryOptions];
  if (!coverageOptions.some((option) => option.value === residence))
    coverageOptions.splice(coverageOptions.length - 1, 0, {
      value: residence,
      label: countryName(residence, ui),
    });
  let coverage = await choose(
    m("coverage"),
    coverageOptions,
    Math.max(1, coverageOptions.findIndex((o) => o.value === residence) + 1),
    true,
  );
  if (coverage.includes("OTHER"))
    coverage = coverage
      .filter((c) => c !== "OTHER")
      .concat(await anotherCountry());
  const selectedInterests = await choose(
    m("topics"),
    interests.map((item) => ({ value: item.value, label: item[ui] })),
    0,
    true,
    true,
  );
  const size = await choose(
    m("size"),
    ["short", "balanced", "complete"].map((value) => ({
      value,
      label: m(value),
    })),
    2,
  );
  const zones = [
    { value: machineZone, label: m("computer") },
    ...[
      ["America/Sao_Paulo", "Brasília / São Paulo"],
      ["America/New_York", "New York / Miami"],
      ["America/Chicago", "Chicago / Dallas"],
      ["America/Denver", "Denver"],
      ["America/Los_Angeles", "Los Angeles / Seattle"],
      ["America/Phoenix", "Phoenix"],
      ["Pacific/Honolulu", "Honolulu"],
      ["Europe/Lisbon", "Lisboa / Lisbon"],
      ["Europe/London", "London"],
      ["Europe/Berlin", "Berlin / Paris / Madrid"],
      ["Asia/Tokyo", "Tokyo"],
    ].map(([value, label]) => ({ value, label })),
  ];
  const timeZone = await choose(m("time"), zones);
  let exportPdf = await choose(m("formats"), [
    { value: true, label: m("pdf") },
    { value: false, label: m("html") },
  ]);
  if (exportPdf) {
    try {
      await browser();
    } catch {
      write(`\n${m("noBrowser")}\n`);
      if (!(await choose(m("continueHtml"), yesNo()))) return cancel();
      exportPdf = false;
    }
  }
  const preferences = {
    version: 1,
    setupLanguage: ui,
    language,
    residence,
    coverage: [...new Set(coverage)],
    interests: selectedInterests,
    size,
    timeZone,
    exportPdf,
  };
  write(
    `\n${m("summary")}\n${m("reads")}: ${languages.find((o) => o.value === language).label}\n${m("lives")}: ${countryName(residence, ui)}\n${m("follows")}: ${preferences.coverage.map((c) => countryName(c, ui)).join(", ")}\n${m("subjects")}: ${interests
      .filter((o) => selectedInterests.includes(o.value))
      .map((o) => o[ui])
      .join(", ")}\n`,
  );
  if (!(await choose(m("save"), yesNo()))) return cancel();
  const plan = await buildSetupPlan(preferences, catalog);
  write(`\n${m("checking")}\n`);
  let completed = 0;
  const results = await mapLimit(plan.sources, 6, async (source) => {
    try {
      const status = await probe(source);
      return {
        ...source,
        language: status.language || source.language || null,
        setupStatus: "validated",
        validatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ...source,
        enabled: false,
        setupStatus: "unavailable",
        setupError: error.message,
      };
    } finally {
      write(`  ${m("progress")}: ${++completed}/${plan.sources.length}\n`);
    }
  });
  const available = results.filter((s) => s.enabled !== false);
  if (!available.length) throw new Error(m("none"));
  const missingCountries = preferences.coverage.filter(
    (c) => c !== "GLOBAL" && !available.some((s) => s.country === c),
  );
  if (missingCountries.length) {
    write(
      `\n${m("limited")}: ${missingCountries.map((c) => countryName(c, ui)).join(", ")}. ${m("limitedDetail")}\n`,
    );
    if (!(await choose(m("proceed"), yesNo(), 2))) return cancel();
  }
  const id = randomUUID(),
    presetDir = path.join(root, "data", "setup", "presets", id);
  const metadata = {
    language,
    region: residence,
    coverage: preferences.coverage,
    timeZone,
    editorialContext: `Reader living in ${countryName(residence, "en")}. Prioritize news about ${preferences.coverage.map((c) => countryName(c, "en")).join(", ")}. Output language: ${language}. Do not imply local availability or laws without source evidence.`,
    sourceLanguages: [],
    maxCandidates: size === "short" ? 80 : size === "complete" ? 160 : 120,
    maxItemsPerFeed: 20,
    llmMinScore: 4.0,
    bundledTaxonomy: false,
    plugins: [
      "05-editorial-contract-bootstrap.plugin.mjs",
      "09-copy-integrity.plugin.mjs",
      "10-semantic-editorial-review.plugin.mjs",
      "20-editorial-presentation.plugin.mjs",
      "editorial-ranking.plugin.mjs",
      "99-editorial-quality-gate.plugin.mjs",
    ],
    requiredPlugins: [
      "05-editorial-contract-bootstrap.plugin.mjs",
      "99-editorial-quality-gate.plugin.mjs",
    ],
  };
  const relativePreset = `./${path.relative(root, presetDir).split(path.sep).join("/")}`;
  const next = { ...previous };
  for (const key of [
    "CATEGORIES_FILE",
    "FEEDS_FILE",
    "ROUTING_FILE",
    "ENABLED_PLUGINS",
    "REQUIRED_PLUGINS",
    "EDITORIAL_PROFILES_FILE",
    "PLUGINS_DIR",
  ])
    delete next[key];
  Object.assign(next, {
    PRESET: "custom",
    PRESET_DIR: relativePreset,
    LANGUAGE: language,
    REGION: residence,
    COVERAGE: preferences.coverage.join(","),
    SOURCE_LANGUAGES: "",
    TIME_ZONE: timeZone,
    EDITORIAL_CONTEXT: metadata.editorialContext,
    EDITORIAL_PROFILE: size === "short" ? "minimal" : "balanced",
    PUBLICATION_NAME: previous.PUBLICATION_NAME || "Highlords Daily",
    OLLAMA_MODEL: previous.OLLAMA_MODEL || "qwen3:4b",
    ITEMS_PER_CATEGORY:
      size === "short" ? "1" : size === "complete" ? "3" : "2",
    MAX_CANDIDATES: String(metadata.maxCandidates),
    MAX_ITEMS_PER_FEED: "20",
    EXPORT_PDF: String(exportPdf),
    REQUIRE_PDF: "false",
    AUTO_OPEN: "true",
    PLUGINS_ENABLED: "true",
    COPY_MODE: "extractive",
  });
  // Write a complete generation before switching the active preferences.
  await atomicWrite(
    path.join(presetDir, "preset.json"),
    JSON.stringify(metadata, null, 2),
  );
  await atomicWrite(
    path.join(presetDir, "categories.yml"),
    yaml({ version: 1, preset: "personal", categories: plan.categories }),
  );
  await atomicWrite(
    path.join(presetDir, "feeds.yml"),
    yaml({ version: 1, preset: "personal", feeds: available }),
  );
  await atomicWrite(
    path.join(presetDir, "source-checks.json"),
    JSON.stringify(results, null, 2),
  );
  await atomicWrite(
    path.join(presetDir, "preferences.json"),
    JSON.stringify(
      {
        ...preferences,
        configuredAt: new Date().toISOString(),
        sources: available.map((s) => s.name),
        missingCountries,
      },
      null,
      2,
    ),
  );
  if (original !== null)
    await atomicWrite(
      path.join(root, `.env.backup-${Date.now()}-${id}`),
      original,
    );
  await atomicWrite(
    target,
    `# Generated by Highlords Daily setup. Use the assistant to change preferences.\n${Object.entries(
      next,
    )
      .map(([key, value]) => `${key}=${envValue(value)}`)
      .join("\n")}\n`,
  );
  write(
    `\n${m("ready")} ${available.length} ${m("available")}.\n${m("next")}\n`,
  );
  return {
    cancelled: false,
    preferences,
    presetDir,
    availableSources: available.length,
    missingCountries,
  };
}
