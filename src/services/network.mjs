import { config } from "../config.mjs";
import { limiter } from "../utils/concurrency.mjs";
import { count } from "../engine/metrics.mjs";
const globalLimit = limiter(
  Math.max(config.feedConcurrency, config.imageConcurrency),
);
const domains = new Map();
export async function networkTask(url, action) {
  const domain = new URL(url).host;
  if (!domains.has(domain))
    domains.set(domain, limiter(config.domainConcurrency));
  return domains.get(domain)(() =>
    globalLimit(async () => {
      count("networkRequests");
      return action();
    }),
  );
}
export async function readBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response exceeds configured byte limit.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body || []) {
    bytes += chunk.length;
    if (bytes > maxBytes)
      throw new Error("Response exceeds configured byte limit.");
    chunks.push(Buffer.from(chunk));
  }
  count("networkBytes", bytes);
  return Buffer.concat(chunks);
}
