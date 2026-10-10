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
  const references = [...html.matchAll(/(?:src|href)="((?:\.{1,2}\/|\/)[^"#]+)"/g)].map(m => m[1]);
  for (const match of html.matchAll(/srcset="([^"]+)"/g))
    for (const image of match[1].split(",")) references.push(image.trim().split(/\s/)[0]);
  assert.ok(references.length > 30);
  for (const reference of references) {
    const resolved = new URL(reference, page);
    assert.ok(resolved.pathname.startsWith("/disi-website/"), reference);
    assert.ok((await stat("pages/" + resolved.pathname.slice("/disi-website/".length))).isFile());
  }
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  const version = html.match(/app\.js\?v=([a-f0-9]{12})/)[1];
  assert.ok(html.includes(`name="site-version" content="${version}"`));
  assert.equal(JSON.parse(await readFile("pages/version.json", "utf8")).version, version);
  assert.match(html, /connect-src 'self'/);
  assert.ok(html.includes(`styles.css?v=${version}`));
  const app = await readFile("pages/app.js", "utf8");
  for (const file of ["drag-pan.js", "panorama.js", "freshness.js"])
    assert.ok(app.includes(`./${file}?v=${version}`), file);
  execFileSync(process.execPath, ["scripts/prepare-pages.mjs"]);
  assert.ok((await readFile("pages/index.html", "utf8")).includes(`app.js?v=${version}`));
  const panorama = await readFile("pages/panorama.js", "utf8");
  const asset = panorama.match(/new URL\("([^"\s]+)", import.meta.url\)/)[1];
  assert.equal(new URL(asset, new URL("panorama.js", page)).href, `${page.href}assets/panorama-4096.webp`);
});
