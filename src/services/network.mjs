import { config } from "../config.mjs";
import { limiter } from "../utils/concurrency.mjs";
import { count } from "../engine/metrics.mjs";

const nativeFetch = globalThis.fetch.bind(globalThis);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const FETCH_PATCH = Symbol.for("highlords.fetch.redirect-limit");
const globalLimit = limiter(
  Math.max(config.feedConcurrency, config.imageConcurrency),
);
const domains = new Map();

async function cancelResponse(response) {
  try {
    await response.body?.cancel();
  } catch {}
}

export async function fetchWithRedirectLimit(
  input,
  options = {},
  maxRedirects = 8,
) {
  if (
    typeof input !== "string" &&
    !(typeof URL !== "undefined" && input instanceof URL)
  )
    return nativeFetch(input, options);

  let current = new URL(String(input)).toString();
  const visited = new Set([current]);

  for (let redirects = 0; ; redirects += 1) {
    const response = await nativeFetch(current, {
      ...options,
      redirect: "manual",
    });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    if (redirects >= maxRedirects) {
      await cancelResponse(response);
      throw new Error(`Redirect limit exceeded (${maxRedirects}).`);
    }

    const next = new URL(location, current);
    if (!["http:", "https:"].includes(next.protocol)) {
      await cancelResponse(response);
      throw new Error(`Unsupported redirect protocol: ${next.protocol}`);
    }
    if (visited.has(next.toString())) {
      await cancelResponse(response);
      throw new Error("Redirect loop detected.");
    }

    await cancelResponse(response);
    current = next.toString();
    visited.add(current);
  }
}

// Node/Undici can emit MaxListenersExceededWarning when following long redirect
// chains internally. Keep ordinary fetch behavior untouched, but route explicit
// `redirect: "follow"` calls through our bounded implementation instead.
if (!globalThis[FETCH_PATCH]) {
  globalThis[FETCH_PATCH] = true;
  globalThis.fetch = (input, options = {}) =>
    options?.redirect === "follow"
      ? fetchWithRedirectLimit(input, options)
      : nativeFetch(input, options);
}

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
    await cancelResponse(response);
    throw new Error("Response exceeds configured byte limit.");
  }
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of response.body || []) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        await cancelResponse(response);
        throw new Error("Response exceeds configured byte limit.");
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    await cancelResponse(response);
    throw error;
  }
  count("networkBytes", bytes);
  return Buffer.concat(chunks);
}
