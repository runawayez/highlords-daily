const identities = new Map([
  ["www.theverge.com", ["en-US", "US"]],
  ["feeds.arstechnica.com", ["en-US", "US"]],
  ["news.ycombinator.com", ["en-US", "US"]],
  ["techcrunch.com", ["en-US", "US"]],
  ["github.blog", ["en-US", "US"]],
  ["feed.infoq.com", ["en-US", "US"]],
  ["www.tomshardware.com", ["en-US", "US"]],
  ["www.rockpapershotgun.com", ["en-GB", "GB"]],
]);
export function sourceIdentity(url) {
  let identity;
  try {
    identity = identities.get(new URL(url).hostname);
  } catch {}
  return identity
    ? { language: identity[0], country: identity[1], coverage: ["GLOBAL"] }
    : {};
}
