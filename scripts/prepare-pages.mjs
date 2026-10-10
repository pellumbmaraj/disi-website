import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const source = new URL("../dist/", import.meta.url);
const output = new URL("../pages/", import.meta.url);
const site = new URL(process.env.SITE_URL || "https://pellumbmaraj.github.io/disi-website/");
if (site.protocol !== "https:" || site.username || site.password || site.search || site.hash)
  throw new Error("SITE_URL must be an HTTPS website URL without credentials, query or fragment.");
if (!site.pathname.endsWith("/")) site.pathname += "/";

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
// Version the whole module graph and CSS so a phone cannot mix a new page with
// cached touch controls/rendering code from the previous deployment.
const runtimeFiles = ["app.js", "drag-pan.js", "panorama.js", "styles.css"];
const runtime = await Promise.all(runtimeFiles.map(file => readFile(new URL(file, source), "utf8")));
const version = createHash("sha256").update(runtime.join("\0")).digest("hex").slice(0, 12);
for (let index = 0; index < runtimeFiles.length; index++) {
  const file = runtimeFiles[index];
  if (!file.endsWith(".js")) continue;
  const code = runtime[index].replace(/(["'])(\.\/[^"'?]+\.js)\1/g, (_, quote, path) => `${quote}${path}?v=${version}${quote}`);
  await writeFile(new URL(file, output), code);
}
let html = await readFile(new URL("index.html", output), "utf8");
html = html.replace(/((?:src|href)=")(\.\/(?:app\.js|styles\.css))"/g, (_, prefix, path) => `${prefix}${path}?v=${version}"`);
html = html.replace(/(property="og:url"\s+content=")[^"]+/, (_, prefix) => prefix + site.href)
  .replace(/(rel="canonical"\s+href=")[^"]+/, (_, prefix) => prefix + site.href)
  .replace(/(property="og:image"\s+content=")[^"]+/, (_, prefix) => prefix + new URL("assets/iconic-1600.webp", site).href);
await writeFile(new URL("index.html", output), html);
await writeFile(new URL(".nojekyll", output), "");
// GitHub Pages does not apply this provider-specific response header file.
await rm(new URL("_headers", output));
console.log(`Prepared ${fileURLToPath(output)} for ${site.href}`);
