import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("Pages output resolves every asset under the repository path", async () => {
  execFileSync(process.execPath, ["scripts/prepare-pages.mjs"], {
    env: { ...process.env, SITE_URL: "https://example.github.io/disi-website/" },
  });
  const html = await readFile("pages/index.html", "utf8");
  const page = new URL("https://example.github.io/disi-website/");
  assert.ok(html.includes(`href="${page.href}"`));
  assert.ok(html.includes(`content="${page.href}assets/iconic-1600.webp"`));
  const references = [...html.matchAll(/(?:src|href)="((?:\.{1,2}\/|\/)[^"#?]+)"/g)].map(m => m[1]);
  for (const match of html.matchAll(/srcset="([^"]+)"/g))
    for (const image of match[1].split(",")) references.push(image.trim().split(/\s/)[0]);
  assert.ok(references.length > 30);
  for (const reference of references) {
    const resolved = new URL(reference, page);
    assert.ok(resolved.pathname.startsWith("/disi-website/"), reference);
    assert.ok((await stat("pages/" + resolved.pathname.slice("/disi-website/".length))).isFile());
  }
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  const panorama = await readFile("pages/panorama.js", "utf8");
  const asset = panorama.match(/new URL\("([^"\s]+)", import.meta.url\)/)[1];
  assert.equal(new URL(asset, new URL("panorama.js", page)).href, `${page.href}assets/panorama-4096.webp`);
});
