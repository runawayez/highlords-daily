import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parse } from "yaml";

test("BR feed guardrails keep broad sources from contaminating Economy", async () => {
  const feeds = parse(
    await fs.readFile(
      new URL("../presets/br/feeds.yml", import.meta.url),
      "utf8",
    ),
  ).feeds;

  const olharDigital = feeds.find((feed) => feed.name === "Olhar Digital");
  assert.ok(olharDigital);
  assert.equal(olharDigital.strict_focus, true);
  assert.ok(olharDigital.focus.includes("games"));
  assert.ok(!olharDigital.focus.includes("economia"));

  assert.ok(
    !feeds.some(
      (feed) => feed.name === "Exame" && feed.url === "https://exame.com/feed/",
    ),
    "generic Exame feed must not be hard-locked to Economy",
  );

  const economyFeeds = feeds.filter(
    (feed) =>
      feed.strict_focus === true &&
      Array.isArray(feed.focus) &&
      feed.focus.length === 1 &&
      feed.focus[0] === "economia",
  );
  assert.ok(economyFeeds.length >= 6);
});
