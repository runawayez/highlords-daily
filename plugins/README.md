# Plugins

The engine loads enabled `plugins/*.plugin.mjs` in filename order. `PLUGINS_ENABLED=false` disables plugins; `ENABLED_PLUGINS` and preset metadata select a subset. BR currently enables contract bootstrap, strict-focus audit, copy integrity, semantic review, presentation, human editorial ranking and a final quality gate. The eSports routing plugin is also available for compatible presets; it is not enabled by every preset.

Hooks:

```js
export const name = 'Example';
export async function afterCollect(state, context) { return state; }
export async function afterAnalyze(state, context) { return state; }
export async function beforeRender(state, context) { return state; }
export async function afterWrite(context) {}
export async function exportEdition(context) {}
```

`afterCollect` / `afterAnalyze` receive `articles`; `beforeRender` receives `edition` and `editionDir`. The payload includes execution `context` where provided. Return an updated payload or leave it unchanged. Plugins may export named functions or a default object.

Optional hook/export errors are warnings. **A plugin with `fatal: true`, or an error with `fatal: true`, stops the run.** The BR quality gate uses this contract to prevent publishing without required coverage. Do not assume every plugin failure is recoverable.

Article transitions are recorded in the editorial report. Review plugins also record their model decisions. If adding a discard rule, preserve its evidence through `decision()` from `src/editorial/audit.mjs`; do not invent a rationale for a model choice that was not returned.

The ranking plugin keeps section and front-page scores separate, with dimensional evaluation and global calibration. `coverageCount` counts publishers; consensus weighting uses conservative `independentCoverageCount`, based on declared reporting origins and duplicate-excerpt checks. See `docs/EDITORIAL_QUALITY.md` for configuration, evaluation, source-copy integrity and limitations.
