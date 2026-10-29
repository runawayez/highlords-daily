import { config } from "../config.mjs";
import { DiskCache, digest } from "../utils/storage.mjs";
import { count } from "../engine/metrics.mjs";
import { requestChat, validateSchema } from "./ollama-client.mjs";

const reviewCache = new DiskCache(config.cacheDir);

// Cache independent decisions, never batch-local IDs or failures. A changed
// prompt, taxonomy, input category or source text invalidates the decision.
export async function requestItemReview(
  system,
  items,
  {
    namespace,
    schema,
    purpose = namespace,
    request = requestChat,
    cache = config.analysisCacheDays ? reviewCache : null,
  } = {},
) {
  const rows = [],
    pending = [],
    keys = new Map();
  const rowSchema = schema.properties.items.items;
  const properties = { ...rowSchema.properties };
  delete properties.id;
  for (const item of items) {
    const { id, ...content } = item;
    const key = digest({
      version: 2,
      model: config.ollamaModel,
      modelDigest: config.ollamaModelDigest || null,
      system,
      content,
      properties,
    });
    keys.set(id, key);
    let cached = await cache?.get(namespace, key);
    if (cached) {
      cached = { ...cached, id };
      try {
        validateSchema(cached, rowSchema);
        rows.push(cached);
        count(`${purpose}.cacheHits`);
        continue;
      } catch {
        /* Invalid cached output must be recomputed. */
      }
    }
    pending.push(item);
  }
  async function reviewPending(batch) {
    // Keep model-facing IDs short and contiguous, including mixed cache hits.
    const localItems = batch.map((item, index) => ({ ...item, id: index + 1 }));
    const localSchema = structuredClone(schema);
    localSchema.properties.items.items.properties.id = {
      type: "integer",
      enum: localItems.map((item) => item.id),
    };
    const response = await request(system, JSON.stringify(localItems), {
      schema: localSchema,
      timeoutMs: 150000,
      purpose,
    });
    validateSchema(response, localSchema);
    const seen = new Set();
    for (const row of response.items) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      const id = batch[row.id - 1].id;
      const restored = { ...row, id };
      validateSchema(restored, rowSchema);
      rows.push(restored);
      const { id: ignoredId, ...decision } = restored;
      if (cache)
        await cache.set(
          namespace,
          keys.get(id),
          decision,
          config.analysisCacheDays * 86400000,
        );
    }
    return batch.filter((_, index) => !seen.has(index + 1));
  }
  if (pending.length) {
    const missing = await reviewPending(pending);
    // One bounded retry for omissions. Never throw away good decisions when
    // the retry fails, and never fabricate approval for the missing rows.
    if (missing.length) {
      try {
        await reviewPending(missing);
      } catch {
        count(`${purpose}.retryFailures`);
      }
    }
  }
  return rows;
}
