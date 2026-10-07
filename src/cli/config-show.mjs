import {
  config,
  categories,
  feeds,
  editorial,
  publication,
  profile,
} from "../config.mjs";
const displayed = { ...config };
try {
  const url = new URL(displayed.ollamaHost);
  url.username = "";
  url.password = "";
  displayed.ollamaHost = url.href;
} catch {}
console.log(
  JSON.stringify(
    { config: displayed, editorial, publication, profile, categories, feeds },
    null,
    2,
  ),
);
