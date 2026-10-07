import http from "node:http";
import { mapLimit } from "../src/utils/concurrency.mjs";
import { digest } from "../src/utils/storage.mjs";
const server = http.createServer((request, response) =>
  setTimeout(() => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        source: request.url,
        items: ["東京", "ciência", "العلم"],
      }),
    );
  }, 30),
);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const urls = Array.from(
    { length: 12 },
    (_, index) => `http://127.0.0.1:${server.address().port}/${index}`,
  );
  const run = async (concurrency) => {
    const started = performance.now();
    const items = await mapLimit(urls, concurrency, async (url) =>
      (await fetch(url)).json(),
    );
    return {
      concurrency,
      durationMs: Math.round(performance.now() - started),
      itemsDigest: digest(items),
    };
  };
  const sequential = await run(1);
  const concurrent = await run(4);
  if (sequential.itemsDigest !== concurrent.itemsDigest)
    throw new Error("Concurrency changed output ordering.");
  console.log(
    JSON.stringify(
      {
        kind: "local-network-fixture",
        note: "Measures feed I/O orchestration, not real Ollama generation.",
        sequential,
        concurrent,
        speedup: Number(
          (sequential.durationMs / concurrent.durationMs).toFixed(2),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
