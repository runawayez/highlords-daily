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
      version: 1,
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
  if (pending.length) {
    const response = await request(system, JSON.stringify(pending), {
      schema,
      timeoutMs: 150000,
      purpose,
    });
    validateSchema(response, schema);
    const expected = new Set(pending.map((item) => item.id));
    const seen = new Set();
    for (const row of response.items) {
      if (!expected.has(row.id) || seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
      const { id, ...decision } = row;
      if (cache)
        await cache.set(
          namespace,
          keys.get(id),
          decision,
          config.analysisCacheDays * 86400000,
        );
    }
  }
  return rows;
}
