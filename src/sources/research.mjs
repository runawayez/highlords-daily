import { networkTask, readBody } from "../services/network.mjs";
// Free, optional directory research. Wikipedia discovers candidates; it does not certify their editorial quality.
export async function researchSites({
  region,
  language = "en",
  limit = 8,
  fetcher = fetch,
}) {
  const code = new Intl.Locale(language).language;
  const endpoint = `https://${code}.wikipedia.org/w/api.php`;
  const request = async (params) => {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      ...params,
    });
    return networkTask(url.href, async () => {
      const response = await fetcher(url.href, {
        headers: { "user-agent": "HighlordsDaily/5.0 source discovery" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Directory HTTP ${response.status}`);
      return JSON.parse((await readBody(response, 1000000)).toString("utf8"));
    });
  };
  const regionName = /^[A-Z]{2}$/.test(region)
    ? new Intl.DisplayNames(["en"], { type: "region" }).of(region)
    : region;
  const result = await request({
    list: "search",
    srsearch: `${regionName} newspaper news media`,
    srlimit: String(Math.min(10, limit)),
  });
  const ids = (result.query?.search || []).map((item) => item.pageid);
  if (!ids.length) return [];
  const pages = await request({
    pageids: ids.join("|"),
    prop: "extlinks",
    ellimit: "100",
  });
  const candidates = new Map();
  const excluded =
    /(wikipedia|wikimedia|facebook|twitter|x\.com|instagram|youtube|archive\.org|web\.archive|doi\.org)/i;
  for (const page of Object.values(pages.query?.pages || {}))
    for (const item of page.extlinks || []) {
      try {
        const url = new URL(item["*"]);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          excluded.test(url.hostname)
        )
          continue;
        // Prefer official home pages; article links are citations, not source identities.
        if (url.pathname !== "/" && url.pathname !== "") continue;
        candidates.set(url.origin, {
          site: url.origin,
          title: page.title,
          provenance: `${endpoint}?pageid=${page.pageid}`,
          status: "candidate",
        });
      } catch {}
    }
  return [...candidates.values()].slice(0, limit);
}
