import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "builds/atelier_anna_web_v1.0.0");
const port = Number(process.argv[3] ?? 4173);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const requestedPath = resolve(root, `.${pathname}`);
    if (requestedPath !== root && !requestedPath.startsWith(`${root}${sep}`)) throw new Error("Path outside root");
    const filePath = statSync(requestedPath).isDirectory() ? resolve(requestedPath, "index.html") : requestedPath;
    const file = statSync(filePath);
    const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    const cacheControl = filePath.endsWith(`${sep}service-worker.js`) ? "no-cache" : "no-store";
    const baseHeaders = {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": cacheControl,
      "Accept-Ranges": "bytes",
    };
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= file.size) {
        response.writeHead(416, { "Content-Range": `bytes */${file.size}` });
        return response.end();
      }
      response.writeHead(206, { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${file.size}`, "Content-Length": end - start + 1 });
      if (request.method === "HEAD") return response.end();
      return createReadStream(filePath, { start, end }).pipe(response);
    }
    response.writeHead(200, { ...baseHeaders, "Content-Length": file.size });
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}/`);
});
