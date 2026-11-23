import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { projectImages } from "../dist/project-images.js";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const html = await readFile(path.join(root, "index.html"), "utf8");
const css = await readFile(path.join(root, "styles.css"), "utf8");
const js = await readFile(path.join(root, "app.js"), "utf8");
const panorama = await readFile(path.join(root, "panorama.js"), "utf8");
const files = new Set(
  [...html.matchAll(/(?:src|href)="((?:\.{1,2}\/|\/)[^"#?]+)"/g)].map((m) => m[1]),
);
for (const match of html.matchAll(/srcset="([^"]+)"/g))
  for (const item of match[1].split(",")) files.add(item.trim().split(" ")[0]);
for (const match of js.matchAll(/import\(['"]\.([^'"]+)['"]\)/g)) files.add(match[1]);
for (const match of js.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) files.add(match[1]);
// Include on-demand assets that aren't referenced in the HTML.
for (const match of (js + panorama).matchAll(/["']((?:\.\/|\/)assets\/[^"']+)["']/g))
  files.add(match[1]);
// Fonts and any other stylesheet assets.
for (const match of css.matchAll(/url\("?(\.\/[^")]+)"?\)/g)) files.add(match[1]);
for (const photos of Object.values(projectImages)) for (const photo of photos) {
  files.add(photo.src);
  files.add(photo.preview);
  for (const source of photo.srcset.split(",")) files.add(source.trim().split(/\s/)[0]);
}
for (const file of files)
  if (!(await stat(path.join(root, file))).isFile())
    throw new Error(`Missing: ${file}`);
for (const file of ["app.js", "panorama.js", "drag-pan.js", "freshness.js", "gallery.js", "i18n.js", "project-images.js", "theme.js"]) {
  const result = spawnSync(
    process.execPath,
    ["--check", path.join(root, file)],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
}
if ((html.match(/<h1\b/g) || []).length !== 1)
  throw new Error("Expected one H1");
for (const tag of html.matchAll(/<img\b[^>]*>/g))
  if (
    !/\balt=/.test(tag[0]) ||
    !/\bwidth=/.test(tag[0]) ||
    !/\bheight=/.test(tag[0])
  )
    throw new Error(`Missing image accessibility or dimensions: ${tag[0]}`);
if (/on(?:click|load|error)=|<script(?![^>]*(?:src=|type="application\/ld\+json"))/.test(html))
  throw new Error("Inline script is not permitted");
for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
  JSON.parse(match[1]);
// Every shipped asset must be used and carry a content fingerprint, so
// visitors never download dead weight or reuse a stale cached copy.
const used = new Set([...files].filter(file => file.includes("assets/")).map(file => path.basename(file)));
for (const match of html.matchAll(/assets\/([^"\s)]+)/g)) used.add(match[1]);
for (const file of await readdir(path.join(root, "assets"))) {
  if (!used.has(file)) throw new Error(`Unused asset: ${file}`);
  if (!/-[a-f0-9]{8}\.[a-z0-9]+$/.test(file)) throw new Error(`Asset without fingerprint: ${file}`);
}
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw new Error("Duplicate element id");
const titles = [...html.matchAll(/<h3>\s*([^<]+?)\s*<\/h3>/g)].map(match => match[1]);
if (new Set(titles).size !== titles.length) throw new Error("Two projects share a title");
if (!css.includes("prefers-reduced-motion"))
  throw new Error("Reduced motion support missing");
if (!html.includes("Content-Security-Policy"))
  throw new Error("Fallback CSP missing");
if ((html.match(/data-project=/g) || []).length !== 9)
  throw new Error("Expected 9 projects");
console.log(
  `Checked ${files.size} local references, JavaScript syntax, 9 projects, metadata and image dimensions.`,
);
