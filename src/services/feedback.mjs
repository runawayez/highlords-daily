import { atomicWrite, readJson } from "../utils/storage.mjs";
import { acquireLock, validateDate } from "../engine/run-state.mjs";
import { safeUrl } from "../utils/html.mjs";
import path from "node:path";

export function validateFeedback(document, publication) {
  if (
    document?.version !== 1 ||
    document.publication !== publication ||
    !Array.isArray(document.entries)
  )
    throw new Error("Invalid feedback version or publication.");
  if (document.entries.length > 10000)
    throw new Error("Too many feedback entries.");
  return document.entries.map((entry) => {
    if (
      !entry.key ||
      typeof entry.key !== "string" ||
      !["relevant", "repeated", "wrong-category"].includes(entry.verdict)
    )
      throw new Error("Invalid feedback entry.");
    validateDate(entry.date);
    if (
      entry.verdict === "wrong-category" &&
      !/^[a-z0-9][a-z0-9-]*$/.test(entry.expectedCategory || "")
    )
      throw new Error(
        "Choose the corrected category before importing feedback.",
      );
    const result = {};
    for (const key of [
      "key",
      "date",
      "headline",
      "originalTitle",
      "excerpt",
      "summary",
      "source",
      "language",
      "category",
      "expectedCategory",
      "verdict",
      "updatedAt",
    ])
      result[key] = String(entry[key] || "").slice(
        0,
        key === "excerpt" ? 2000 : 1000,
      );
    result.link = safeUrl(entry.link);
    return result;
  });
}

export async function importFeedback(document, { dataDir, publication }) {
  const entries = validateFeedback(document, publication);
  const release = await acquireLock(path.join(dataDir, "feedback.lock"));
  try {
    const target = path.join(dataDir, "editorial-feedback.json");
    const old = await readJson(target, { entries: [] });
    const merged = new Map(
      old.entries.map((entry) => [`${entry.date}:${entry.key}`, entry]),
    );
    for (const entry of entries)
      merged.set(`${entry.date}:${entry.key}`, entry);
    await atomicWrite(
      target,
      JSON.stringify(
        { version: 1, publication, entries: [...merged.values()] },
        null,
        2,
      ),
    );
    return { imported: entries.length, total: merged.size, file: target };
  } finally {
    await release();
  }
}
