# Plugins

The engine loads files ending in `.plugin.mjs` from this directory when `PLUGINS_ENABLED=true`.

Highlords Daily ships with `00-esports-routing.plugin.mjs`, a deterministic routing layer for the Vanilla `eSports` section. It identifies clear competitive-gaming signals (for example CBLOL, VCT, CS2 Majors, IEM, Worlds, professional rosters and tournament context) before/after the regular Ollama classification so competitive stories do not fall back into generic `Games`.

Highlords Daily also ships with `editorial-ranking.plugin.mjs`, the bundled second-pass editorial ranking engine. It deepens the candidate scan, detects cross-source coverage, remembers the previous successful edition and asks Ollama to evaluate human newsworthiness (impact, historical significance, public interest, novelty, utility, editorial value and promotional level) before a final global front-page calibration.

The bundled ranking can be tuned with `EDITORIAL_DEEP_*`, `EDITORIAL_CYCLE_OVERLAP_HOURS`, `EDITORIAL_RANKING_BATCH_SIZE` and `EDITORIAL_GLOBAL_CALIBRATION_SIZE` in `.env`. Set `EDITORIAL_DEEP_SCAN=false` to keep the original collection limits. Set `PLUGINS_ENABLED=false` to disable all plugins, including the bundled routing/ranking layers.

A plugin may export any of these hooks:

```js
export const name = 'my-plugin';

export async function afterCollect(state) {
  // state: { articles, errors, imageRejected, editionDate }
  return state;
}

export async function afterAnalyze(state) {
  // state: { articles, editionDate }
  return state;
}

export async function beforeRender(state) {
  // state: { edition, editionDir }
  return state;
}

export async function afterWrite(context) {
  // context: { edition, editionDir, paths }
}

export async function exportEdition(context) {
  // Create any extra local output you want.
}
```

Plugin errors are isolated: the edition continues and the failure is printed as a warning.
