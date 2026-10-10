import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  fileURLToPath(new URL("../dist/", import.meta.url)),
);
export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};
export function createServer() {
  return http.createServer(async (req, res) => {
    for (const [key, value] of Object.entries(securityHeaders))
      res.setHeader(key, value);
    res.setHeader("Cache-Control", "no-cache");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    try {
      let route = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (route === "/") route = "/index.html";
      if (
        route.includes("\0") ||
        route.includes("\\") ||
        route.split("/").includes("..")
      )
        throw new Error("Invalid path");
      const candidate = path.resolve(root, "." + route);
      if (!candidate.startsWith(root + path.sep))
        throw new Error("Outside root");
      const actual = await realpath(candidate);
      if (!actual.startsWith(root + path.sep) || !(await stat(actual)).isFile())
        throw new Error("Outside root");
      const type = types[path.extname(actual)];
      if (!type) throw new Error("Unsupported file");
      const bytes = await readFile(actual);
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": bytes.length,
        "Cache-Control": route.startsWith("/assets/")
          ? "public, max-age=86400"
          : "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : "Not found");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 4173);
  const server = createServer();
  server.listen(port, "127.0.0.1", () =>
    console.log(`Local: http://127.0.0.1:${server.address().port}`),
  );
  process.on("SIGINT", () => server.close());
  process.on("SIGTERM", () => server.close());
}
