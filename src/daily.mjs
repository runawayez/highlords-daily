import { maintainCache } from "./services/cache-maintenance.mjs";
import { fileURLToPath } from "node:url";
import { createContext } from "./engine/context.mjs";
import { runPipeline } from "./engine/pipeline.mjs";
import { atomicWrite } from "./utils/storage.mjs";
import {
  normalizeNewsletter,
  fallbackNewsletter,
} from "./editorial/edition.mjs";
import { curateFrontPage } from "./editorial/front-page.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { escapeHtml } from "./utils/html.mjs";
import { uiCatalog } from "./services/i18n.mjs";
import { config, publication } from "./config.mjs";
import { fetchAllFeeds } from "./services/rss.mjs";
import {
  analyzeArticles,
  curateNewsletter,
  ensureOllama,
} from "./services/ollama.mjs";
import { renderHtmlPdf } from "./services/html-pdf.mjs";
import { cacheEditionImages } from "./services/image-cache.mjs";
import {
  deduplicateArticles,
  pruneHistory,
  rememberEdition,
} from "./services/memory.mjs";
import { updateArchive } from "./services/archive.mjs";
import { loadPlugins, runPluginExporters, runPluginHook } from "./plugins.mjs";
import { renderMarkdown } from "./exporters/markdown.mjs";
import { renderEmailHtml } from "./exporters/email.mjs";
import {
  renderDiscordMarkdown,
  renderSocialText,
} from "./exporters/social.mjs";
import { renderNewsletterHtml } from "./template.mjs";

function mimeForLogo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    }[ext] || "application/octet-stream"
  );
}

async function loadLogoDataUri() {
  try {
    const buffer = await fs.readFile(publication.logoFile);
    return `data:${mimeForLogo(publication.logoFile)};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

function logAnalysisProgress(event) {
  if (event.status === "start") {
    process.stdout.write(`  lote ${event.batch}/${event.totalBatches}... `);
    return;
  }
  if (event.status === "done") {
    const details = [
      `${event.approved} aprovadas`,
      `${event.classified} classificadas`,
      `${event.invalidCategory} sem categoria`,
      `${event.strictMismatch || 0} fora do foco estrito`,
      `${event.belowScore} abaixo de ${config.llmMinScore}`,
      `${event.missing} ausentes`,
    ];
    if (event.retried) details.push("retry");
    console.log(details.join(" | "));
    return;
  }
  if (event.status === "error") {
    console.log(`falhou: ${event.error}`);
    return;
  }
  if (event.status === "rescue") {
    console.log(
      `  Nenhuma matéria passou do corte ${event.threshold}; usando ${event.count} classificadas pelo Ollama como resgate.`,
    );
    return;
  }
  if (event.status === "category-rescue") {
    console.log(
      `  ${event.category}: +${event.count} candidata(s) de reserva (mínimo ${event.floor.toFixed(1)}); total ${event.total}.`,
    );
  }
}

function latestRedirectHtml(editionDate) {
  const target = `./${editionDate}/index.html`;
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>${escapeHtml(publication.name)}</title><p><a href="${target}">${escapeHtml(uiCatalog().latest)}</a></p>`;
}

async function writeExports(edition, editionDir) {
  const files = {};
  if (config.exportMarkdown) {
    files.markdown = path.join(editionDir, "edition.md");
    await fs.writeFile(files.markdown, renderMarkdown(edition), "utf8");
  }
  if (config.exportEmail) {
    files.email = path.join(editionDir, "email.html");
    const email = renderEmailHtml(edition);
    await fs.writeFile(files.email, email, "utf8");
  }
  if (config.exportSocial) {
    files.telegram = path.join(editionDir, "telegram.txt");
    files.discord = path.join(editionDir, "discord.md");
    const social = renderSocialText(edition);
    const discord = renderDiscordMarkdown(edition);
    await Promise.all([
      fs.writeFile(files.telegram, social, "utf8"),
      fs.writeFile(files.discord, discord, "utf8"),
    ]);
  }
  return files;
}

export async function main(options = {}) {
  const context = createContext(options);
  const plugins = await loadPlugins();
  console.log(
    `${publication.name} · ${context.editionDate} · ${config.language} · ${config.region}`,
  );
  console.log(
    `Limits: ${config.maxCandidates} candidates, ${config.maxItemsPerFeed}/feed; ${config.feedConcurrency} concurrent feeds.`,
  );
  const result = await runPipeline(context, {
    preflight: async () => {
      await ensureOllama();
      await maintainCache();
      if (config.historyEnabled) await pruneHistory(config.historyDays);
    },
    collect: async (ctx) =>
      runPluginHook(plugins, "afterCollect", {
        ...(await fetchAllFeeds((event) =>
          console.log(`[feed] ${event.feed}${event.error ? " failed" : ""}`),
        )),
        editionDate: ctx.editionDate,
        context: ctx,
      }),
    analyze: (articles) => analyzeArticles(articles, logAnalysisProgress),
    rank: async (articles, ctx) => {
      const semantic = deduplicateArticles(articles, config.duplicateThreshold);
      const result = await runPluginHook(plugins, "afterAnalyze", {
        articles: semantic.articles,
        editionDate: ctx.editionDate,
        context: ctx,
      });
      return result.articles;
    },
    select: async (articles, ctx) => {
      try {
        const curated = await curateNewsletter(articles, ctx.editionDate);
        try {
          Object.assign(
            curated,
            await curateFrontPage(curated, articles, ctx.editionDate),
          );
        } catch (error) {
          console.warn(`Front page fallback: ${error.message}`);
        }
        return normalizeNewsletter(curated, articles, ctx.editionDate);
      } catch (error) {
        console.warn(`Editor fallback: ${error.message}`);
        return fallbackNewsletter(articles, ctx.editionDate);
      }
    },
    images: async (edition, directory, ctx) => {
      const result = await cacheEditionImages(edition, directory, ctx);
      result.edition.stats.imagesCached = result.cached;
      result.edition.stats.imageCacheFailures = result.failed;
      const rendered = await runPluginHook(plugins, "beforeRender", {
        edition: result.edition,
        editionDir: directory,
        context: ctx,
      });
      return rendered.edition;
    },
    html: async (edition) =>
      renderNewsletterHtml(edition, await loadLogoDataUri()),
    exports: writeExports,
    pdf: renderHtmlPdf,
    remember: rememberEdition,
    publish: async (edition, directory) => {
      await atomicWrite(
        path.join(config.outputDir, "latest.html"),
        latestRedirectHtml(edition.editionDate),
      );
      await atomicWrite(
        path.join(config.outputDir, "latest.json"),
        JSON.stringify(edition, null, 2),
      );
      const names = [
        ["edition.md", "latest.md"],
        ["email.html", "latest-email.html"],
        ["telegram.txt", "latest-telegram.txt"],
        ["discord.md", "latest-discord.md"],
        [
          `${publication.slug}-${edition.editionDate}.pdf`,
          `${publication.slug}-latest.pdf`,
        ],
      ];
      for (const [source, target] of names) {
        try {
          await atomicWrite(
            path.join(config.outputDir, target),
            await fs.readFile(path.join(directory, source)),
          );
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          await fs.rm(path.join(config.outputDir, target), { force: true });
        }
      }
      await updateArchive(config.outputDir);
    },
    afterWrite: async (edition, directory, ctx) => {
      const paths = {
        html: path.join(directory, "index.html"),
        json: path.join(directory, "edition.json"),
        pdf: path.join(
          directory,
          `${publication.slug}-${edition.editionDate}.pdf`,
        ),
      };
      await runPluginExporters(plugins, {
        edition,
        editionDir: directory,
        paths,
        config: ctx.config,
        context: ctx,
      });
      await runPluginHook(plugins, "afterWrite", {
        edition,
        editionDir: directory,
        paths,
        context: ctx,
      });
    },
  });
  console.log(
    `${result.alreadyCompleted ? "Already generated" : "Ready"}: ${path.join(result.editionDir, "index.html")}`,
  );
  if (config.autoOpen)
    await openFile(path.join(result.editionDir, "index.html"));
  if (result.pdfError && process.env.REQUIRE_PDF === "true")
    throw new Error(`Edition saved, PDF pending: ${result.pdfError}`);
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const index = args.indexOf("--date");
  main({
    force: args.includes("--force"),
    deliver: args.includes("--deliver"),
    date: index >= 0 ? args[index + 1] : undefined,
  }).catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

async function openFile(filePath) {
  const absolute = path.resolve(filePath);
  const command =
    process.platform === "win32"
      ? "cmd.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", absolute] : [absolute];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}
