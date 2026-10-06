# Plugins

The engine loads files ending in `.plugin.mjs` from this directory when `PLUGINS_ENABLED=true`.

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
