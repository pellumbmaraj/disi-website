import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
let html = await readFile(new URL("index.html", output), "utf8");
html = html.replace(/(property="og:url"\s+content=")[^"]+/, (_, prefix) => prefix + site.href)
  .replace(/(rel="canonical"\s+href=")[^"]+/, (_, prefix) => prefix + site.href)
  .replace(/(property="og:image"\s+content=")[^"]+/, (_, prefix) => prefix + new URL("assets/iconic-1600.webp", site).href);
await writeFile(new URL("index.html", output), html);
await writeFile(new URL(".nojekyll", output), "");
// GitHub Pages does not apply this provider-specific response header file.
await rm(new URL("_headers", output));
console.log(`Prepared ${fileURLToPath(output)} for ${site.href}`);
