import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
for (const file of files)
  if (!(await stat(path.join(root, file))).isFile())
    throw new Error(`Missing: ${file}`);
for (const file of ["app.js", "panorama.js", "drag-pan.js", "freshness.js"]) {
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
if (/on(?:click|load|error)=|<script(?![^>]*src)/.test(html))
  throw new Error("Inline script is not permitted");
if (!css.includes("prefers-reduced-motion"))
  throw new Error("Reduced motion support missing");
if (!html.includes("Content-Security-Policy"))
  throw new Error("Fallback CSP missing");
if ((html.match(/data-project=/g) || []).length !== 9)
  throw new Error("Expected 9 projects");
console.log(
  `Checked ${files.size} local references, JavaScript syntax, 9 projects, metadata and image dimensions.`,
);
