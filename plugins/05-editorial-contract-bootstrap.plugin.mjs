import { categories, config } from "../src/config.mjs";

// The compositor supports text-first layouts. Treat images as an enhancement
// instead of a collection-time eligibility rule unless explicitly requested.
if (process.env.REQUIRE_IMAGES == null) config.requireImages = false;

// Preserve the configured editorial horizon as the primary reference, but keep
// a deeper reserve pool for categories that publish less frequently. Ranking
// and scoring still favor fresh stories; the extra window is only rescue stock.
config.primaryLookbackHours = config.lookbackHours;
if (process.env.LOOKBACK_HOURS == null && config.lookbackHours < 120) {
  config.lookbackHours = 120;
}

// Category completeness needs enough raw material before Ollama classifies the
// edition. The previous 96-candidate cap could exhaust itself on high-volume
// feeds before sparse sections (especially Mobile & Gadgets) had a fair chance.
if (process.env.MAX_CANDIDATES == null) {
  config.maxCandidates = Math.max(config.maxCandidates, categories.length * 12);
}
if (process.env.MAX_ITEMS_PER_FEED == null) {
  config.maxItemsPerFeed = Math.max(config.maxItemsPerFeed, 20);
}

export default {
  name: "Editorial Contract Bootstrap",
};
