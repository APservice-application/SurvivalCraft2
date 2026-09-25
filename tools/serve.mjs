#!/usr/bin/env node
// tools/serve.mjs — เซิร์ฟเวอร์ทดสอบในเครื่อง (ต้องมี เพราะ Service Worker/PWA ใช้ได้เฉพาะ http(s))
// ใช้: npm run serve  → เปิด http://localhost:8080
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../web");
const port = Number(process.env.PORT || 8080);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/" ) p = "/index.html";
  let file = resolve(root, "." + p);
  if (!file.startsWith(root)) { res.writeHead(403).end("forbidden"); return; }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = resolve(file, "index.html");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("ไม่พบไฟล์: " + p);
  }
}).listen(port, "0.0.0.0", () => {
  console.log("เซิร์ฟเวอร์เกม: http://localhost:" + port + "  (กด Ctrl+C เพื่อหยุด)");
});
