import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../scripts/serve.mjs";
let server, origin;
before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});
test("page loads with restrictive security headers", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.match(
    response.headers.get("content-security-policy"),
    /connect-src 'self'/,
  );
  assert.match(await response.text(), /GR Architecture/);
});
test("HEAD returns metadata without a response body", async () => {
  const response = await fetch(origin + "/assets/hero-960.webp", {
    method: "HEAD",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(await response.text(), "");
  assert.ok(Number(response.headers.get("content-length")) > 0);
});
test("non-read methods do not mutate the static site", async () => {
  const response = await fetch(origin, { method: "POST", body: "test" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});
test("encoded paths and hidden project files cannot escape the static root", async () => {
  for (const pathname of [
    "/..%2fpackage.json",
    "/%2e%2e%2fpackage.json",
    "/%5c..%5cpackage.json",
    "/%00",
    "/%ZZ",
    "/.openai/hosting.json",
    "/_headers",
  ]) {
    const status = await new Promise((resolve, reject) => {
      const req = http.get(origin + pathname, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
    });
    assert.equal(status, 404, pathname);
  }
});
test("HTML and assets receive appropriate cache policies", async () => {
  assert.equal((await fetch(origin)).headers.get("cache-control"), "no-cache");
  assert.equal(
    (await fetch(origin + "/assets/hero-960.webp")).headers.get(
      "cache-control",
    ),
    "public, max-age=86400",
  );
});
