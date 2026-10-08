import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DiskCache } from "../src/utils/storage.mjs";
import { fetchWithRedirectLimit } from "../src/services/network.mjs";

const temporary = () => fs.mkdtemp(path.join(os.tmpdir(), "highlords-cache-"));

test("disk cache write failures are best-effort and do not abort the caller", async () => {
  const directory = await temporary();
  const failures = [];
  const cache = new DiskCache(directory, {
    writer: async () => {
      const error = new Error("file temporarily locked");
      error.code = "EPERM";
      throw error;
    },
    onWriteError: (error, namespace) => failures.push({ error, namespace }),
  });

  try {
    assert.equal(await cache.set("image-probes", "locked", 42, 1000), 42);
    assert.equal(await cache.get("image-probes", "locked"), null);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].error.code, "EPERM");
    assert.equal(failures[0].namespace, "image-probes");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("bounded fetch stops redirect chains before Undici listener warnings", async () => {
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    const step = Number(String(request.url || "/0").slice(1)) || 0;
    if (step < 20) {
      response.writeHead(302, { location: `/${step + 1}` });
      response.end();
      return;
    }
    response.end("ok");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(
      fetchWithRedirectLimit(`${origin}/0`, {}, 4),
      /Redirect limit exceeded \(4\)/,
    );
    assert.equal(requests, 5);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
