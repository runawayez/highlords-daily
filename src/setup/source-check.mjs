import Parser from "rss-parser";
import { decodeFeed } from "../utils/feed-xml.mjs";

const parser = new Parser();
export async function checkSetupSource(
  source,
  { fetcher = fetch, timeoutMs = 8000 } = {},
) {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = source.url;
  for (let redirect = 0; redirect <= 5; redirect++) {
    const response = await fetcher(url, {
      signal,
      redirect: "manual",
      headers: {
        "user-agent": "HighlordsDaily/5.5 setup",
        accept: "application/rss+xml, application/atom+xml, text/xml",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirect === 5)
        throw new Error("Source redirect limit exceeded.");
      const next = new URL(location, url);
      if (!["http:", "https:"].includes(next.protocol))
        throw new Error("Invalid source redirect.");
      url = next.href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Source HTTP ${response.status}`);
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body || []) {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) {
        await response.body?.cancel().catch(() => {});
        throw new Error("Source response too large.");
      }
      chunks.push(Buffer.from(chunk));
    }
    const document = await parser.parseString(
      decodeFeed(
        Buffer.concat(chunks),
        response.headers.get("content-type") || "",
      ),
    );
    if (!document.items?.length) throw new Error("Source contains no stories.");
    return {
      language: source.language || document.language || null,
      items: document.items.length,
      finalUrl: url,
    };
  }
}
