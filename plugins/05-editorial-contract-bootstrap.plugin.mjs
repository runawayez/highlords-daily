import { config } from "../src/config.mjs";

// The compositor already supports text-first layouts. Treat images as an
// enhancement instead of a collection-time eligibility rule unless the user
// explicitly opts back into REQUIRE_IMAGES.
if (process.env.REQUIRE_IMAGES == null) config.requireImages = false;

// Keep the normal editorial horizon as the primary window, but collect a
// slightly wider pool so sparse categories can be rescued without fabricating
// content. Ranking still favors newer stories, so the 72h pool acts as reserve.
config.primaryLookbackHours = config.lookbackHours;
if (process.env.LOOKBACK_HOURS == null && config.lookbackHours < 72) {
  config.lookbackHours = 72;
}

export default {
  name: "Editorial Contract Bootstrap",
};
