import { sendSmtp } from "./smtp.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { config, publication } from "../config.mjs";
import { atomicWrite, digest, readJson } from "../utils/storage.mjs";
import { acquireLock } from "../engine/run-state.mjs";
function chunks(text, limit) {
  const result = [];
  let current = "";
  for (const char of String(text)) {
    if (current.length + char.length > limit) {
      result.push(current);
      current = "";
    }
    current += char;
  }
  if (current) result.push(current);
  return result;
}
export async function deliveryJobs(edition, editionDir, env = process.env) {
  const jobs = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const text = await fs.readFile(
      path.join(editionDir, "telegram.txt"),
      "utf8",
    );
    chunks(text, 4000).forEach((part, index) =>
      jobs.push({
        destination: `telegram:${env.TELEGRAM_CHAT_ID}`,
        index,
        url: `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        body: { chat_id: env.TELEGRAM_CHAT_ID, text: part },
        kind: "telegram",
      }),
    );
  }
  if (env.DISCORD_WEBHOOK_URL) {
    const url = new URL(env.DISCORD_WEBHOOK_URL);
    if (url.protocol !== "https:")
      throw new Error("Discord delivery requires HTTPS.");
    url.searchParams.set("wait", "true");
    const text = await fs.readFile(path.join(editionDir, "discord.md"), "utf8");
    chunks(text, 1900).forEach((part, index) =>
      jobs.push({
        destination: `discord:${digest(env.DISCORD_WEBHOOK_URL)}`,
        index,
        url: url.href,
        body: { content: part, allowed_mentions: { parse: [] } },
        kind: "discord",
      }),
    );
  }
  if (env.EMAIL_WEBHOOK_URL) {
    const url = new URL(env.EMAIL_WEBHOOK_URL);
    if (url.protocol !== "https:")
      throw new Error("Email delivery requires HTTPS.");
    if (!env.EMAIL_TO || !env.EMAIL_FROM)
      throw new Error(
        "Configure EMAIL_TO and EMAIL_FROM for the email gateway.",
      );
    jobs.push({
      destination: `email:${env.EMAIL_TO}:${digest(url.href)}`,
      index: 0,
      url: url.href,
      kind: "email",
      headers: env.EMAIL_WEBHOOK_TOKEN
        ? { authorization: `Bearer ${env.EMAIL_WEBHOOK_TOKEN}` }
        : {},
      body: {
        from: env.EMAIL_FROM,
        to: env.EMAIL_TO.split(",").map((s) => s.trim()),
        subject: `${publication.name} — ${edition.title}`,
        html: await fs.readFile(path.join(editionDir, "email.html"), "utf8"),
      },
    });
  }
  if (env.SMTP_HOST && !env.EMAIL_WEBHOOK_URL) {
    if (!env.EMAIL_TO || !env.EMAIL_FROM)
      throw new Error("Configure EMAIL_TO and EMAIL_FROM for SMTP.");
    jobs.push({
      destination: `smtp:${env.EMAIL_TO}:${env.SMTP_HOST}`,
      index: 0,
      kind: "smtp",
      body: {
        from: env.EMAIL_FROM,
        to: env.EMAIL_TO.split(",").map((s) => s.trim()),
        subject: `${publication.name} — ${edition.title}`,
        html: await fs.readFile(path.join(editionDir, "email.html"), "utf8"),
      },
    });
  }
  return jobs;
}
export async function deliverEdition(
  edition,
  editionDir,
  {
    env = process.env,
    fetcher = fetch,
    smtpSender = sendSmtp,
    forceUncertain = false,
  } = {},
) {
  const release = await acquireLock(path.join(config.dataDir, "delivery.lock"));
  const file = path.join(
    config.dataDir,
    "outbox",
    `${edition.editionDate}.json`,
  );
  try {
    const state = await readJson(file, { jobs: {} });
    const jobs = await deliveryJobs(edition, editionDir, env);
    const failures = [];
    for (const job of jobs) {
      const key = digest([
        publication.slug,
        edition.editionDate,
        job.destination,
        job.index,
        job.body,
      ]);
      const previous = state.jobs[key];
      if (previous?.status === "sent") continue;
      if (
        ["sending", "uncertain"].includes(previous?.status) &&
        !forceUncertain
      ) {
        failures.push(
          `${job.kind}: delivery outcome uncertain; inspect provider before retrying`,
        );
        continue;
      }
      if (previous?.retryAt && Date.parse(previous.retryAt) > Date.now()) {
        failures.push(`${job.kind}: waiting for retry window`);
        continue;
      }
      // Never persist URLs/tokens or message bodies containing recipient data in the outbox.
      state.jobs[key] = {
        kind: job.kind,
        status: "sending",
        attempts: (previous?.attempts || 0) + 1,
        updatedAt: new Date().toISOString(),
      };
      await atomicWrite(file, JSON.stringify(state, null, 2));
      try {
        if (job.kind === "smtp") {
          await smtpSender(job.body, key, env);
          state.jobs[key].status = "sent";
          state.jobs[key].sentAt = new Date().toISOString();
        } else {
          const response = await fetcher(job.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Idempotency-Key": key,
              ...job.headers,
            },
            body: JSON.stringify(job.body),
            signal: AbortSignal.timeout(20000),
          });
          if (!response.ok) {
            const retryAfter = Number(response.headers.get("retry-after") || 0);
            state.jobs[key].status =
              response.status >= 500 ? "uncertain" : "failed";
            if (response.status === 429)
              state.jobs[key].retryAt = new Date(
                Date.now() + Math.max(30, retryAfter) * 1000,
              ).toISOString();
            throw new Error(`HTTP ${response.status}`);
          }
          if (job.kind === "telegram") {
            const payload = await response.json();
            if (payload.ok !== true) {
              state.jobs[key].status = "failed";
              throw new Error("Telegram rejected delivery.");
            }
          }
          state.jobs[key].status = "sent";
          state.jobs[key].sentAt = new Date().toISOString();
        }
      } catch (error) {
        if (state.jobs[key].status === "sending")
          state.jobs[key].status = "uncertain";
        // Fetch errors may contain secret URLs; only retain a generic message.
        state.jobs[key].error =
          state.jobs[key].status === "uncertain"
            ? "Provider outcome unknown"
            : error.message.startsWith("HTTP ")
              ? error.message
              : "Provider rejected delivery";
        failures.push(`${job.kind}: ${state.jobs[key].error}`);
      }
      await atomicWrite(file, JSON.stringify(state, null, 2));
      if (state.jobs[key].status !== "sent") break; // preserve ordering of multi-part deliveries
    }
    if (failures.length) throw new Error(failures.join("; "));
    return {
      configured: jobs.length,
      sent: Object.values(state.jobs).filter((job) => job.status === "sent")
        .length,
    };
  } finally {
    await release();
  }
}
