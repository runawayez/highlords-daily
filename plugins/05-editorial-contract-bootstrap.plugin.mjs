import { config } from "../src/config.mjs";

// The compositor already supports text-first layouts. Treat images as an
// enhancement instead of a collection-time eligibility rule unless the user
// explicitly opts back into REQUIRE_IMAGES.
if (process.env.REQUIRE_IMAGES == null) config.requireImages = false;

export default {
  name: "Editorial Contract Bootstrap",
};
