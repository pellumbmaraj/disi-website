import { test } from "node:test";
import assert from "node:assert/strict";
import { watchForUpdates } from "../dist/freshness.js";

const current = "111111111111", latest = "222222222222";
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({ version = current, url = "https://example.github.io/disi-website/?language=en#projects", response = { version: current }, ok = true } = {}) {
  const doc = new EventTarget(), page = new EventTarget(), calls = [], navigations = [], cleanups = [];
  doc.querySelector = () => ({ content: version });
  doc.visibilityState = "visible";
  page.location = { href: url, replace: href => navigations.push(href) };
  page.history = { state: { position: 12 }, replaceState(state, _, href) {
    cleanups.push({ state, href }); page.location.href = href;
  } };
  const load = async (...args) => { calls.push(args); return { ok, json: async () => response }; };
  return { page, doc, load, calls, navigations, cleanups };
}

test("same release checks without cache or credentials and does not reload", async () => {
  const state = fixture();
  watchForUpdates(state);
  await settle();
  assert.equal(state.calls.length, 1);
  const [url, options] = state.calls[0];
  assert.match(url, /version\.json\?check=\d+$/);
  assert.equal(options.cache, "no-store");
  assert.equal(options.credentials, "omit");
  assert.equal(state.navigations.length, 0);
});

test("a stale page automatically navigates once and preserves query and anchor", async () => {
  const state = fixture({ response: { version: latest } });
  watchForUpdates(state);
  await settle();
  state.doc.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(state.calls.length, 1);
  assert.deepEqual(state.navigations, [`https://example.github.io/disi-website/?language=en&__site_update=${latest}#projects`]);
});

test("after refresh the normal URL is restored without losing history state", async () => {
  const state = fixture({ version: latest, response: { version: latest }, url: `https://example.github.io/disi-website/?language=en&__site_update=${latest}#projects` });
  watchForUpdates(state);
  await settle();
  assert.deepEqual(state.cleanups, [{ state: { position: 12 }, href: "https://example.github.io/disi-website/?language=en#projects" }]);
  assert.equal(state.navigations.length, 0);
});

test("an edge returning old HTML cannot cause an automatic reload loop", async () => {
  const state = fixture({ response: { version: latest }, url: `https://example.github.io/disi-website/?__site_update=${latest}` });
  watchForUpdates(state);
  await settle();
  state.doc.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(state.navigations.length, 0);
  assert.equal(state.page.location.href, "https://example.github.io/disi-website/");
});

test("offline, failed and invalid manifests leave the site usable", async () => {
  for (const options of [{ ok: false }, { response: {} }, { response: { version: "https://evil.example/" } }, { response: null }]) {
    const state = fixture(options);
    watchForUpdates(state);
    await settle();
    assert.equal(state.navigations.length, 0);
  }
  const offline = fixture();
  offline.load = async () => { throw new Error("Offline"); };
  watchForUpdates(offline);
  await settle();
  assert.equal(offline.navigations.length, 0);
});

test("restored and foreground tabs check again; hidden and initial pageshow events do not", async () => {
  const state = fixture();
  watchForUpdates(state);
  await settle();
  state.page.dispatchEvent(new Event("pageshow"));
  state.doc.visibilityState = "hidden";
  state.doc.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(state.calls.length, 1);
  state.doc.visibilityState = "visible";
  state.doc.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(state.calls.length, 2);
  const restored = new Event("pageshow");
  Object.defineProperty(restored, "persisted", { value: true });
  state.page.dispatchEvent(restored);
  await settle();
  assert.equal(state.calls.length, 3);
});

test("overlapping checks coalesce and unbuilt previews make no request", async () => {
  const state = fixture();
  let ready, requests = 0;
  state.load = () => { requests++; return new Promise(resolve => { ready = resolve; }); };
  watchForUpdates(state);
  state.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(requests, 1);
  ready({ ok: true, json: async () => ({ version: current }) });
  await settle();
  const local = fixture({ version: "development" });
  watchForUpdates(local);
  await settle();
  assert.equal(local.calls.length, 0);
});
