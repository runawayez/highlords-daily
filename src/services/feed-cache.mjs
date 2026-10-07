import { config } from "../config.mjs";
import { DiskCache, digest } from "../utils/storage.mjs";
import { networkTask, readBody } from "./network.mjs";
import { count } from "../engine/metrics.mjs";
const cache = new DiskCache(config.cacheDir);
export async function fetchFeedXml(url) {
  const existing = await cache.get("feeds", url, { stale: true });
  const headers = {
    "user-agent": "HighlordsDaily/4.1",
    accept: "application/rss+xml,application/atom+xml,application/xml,text/xml",
  };
  if (existing?.etag) headers["if-none-match"] = existing.etag;
  if (existing?.lastModified)
    headers["if-modified-since"] = existing.lastModified;
  return networkTask(url, async () => {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 304 && existing?.xml) {
      count("feedCacheHits");
      return existing.xml;
    }
    if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
    const xml = (await readBody(response, 2 * 1024 * 1024)).toString("utf8");
    await cache.set(
      "feeds",
      url,
      {
        xml,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      },
      7 * 86400000,
    );
    return xml;
  });
}
export async function recordFeedHealth(url, result) {
  const previous =
    (await cache.get("source-health", url, { stale: true })) || {};
  const data = {
    url,
    id: digest(url),
    lastCheckedAt: new Date().toISOString(),
    ok: !result.error,
    consecutiveFailures: result.error
      ? (previous.consecutiveFailures || 0) + 1
      : 0,
    lastSuccessAt: result.error
      ? previous.lastSuccessAt
      : new Date().toISOString(),
    error: result.error || null,
    elapsedMs: result.elapsedMs,
    items: result.items || 0,
  };
  await cache.set("source-health", url, data, 90 * 86400000);
}
