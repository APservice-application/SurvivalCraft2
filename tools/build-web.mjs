#!/usr/bin/env node
// tools/build-web.mjs — รวมซอร์สเว็บเป็นไฟล์เดียว web/dist/index.html
// เหตุผล: ให้เล่นได้ทันทีแม้ไม่มีเซิร์ฟเวอร์ (เปิดไฟล์ตรง ๆ ได้) และ preview ในแอปไม่ต้องพึ่ง network
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(root, "web");
const distDir = resolve(webDir, "dist");
const outFile = resolve(distDir, "index.html");
const tmpBundle = resolve(distDir, "_bundle.js");
const tmpCss = resolve(distDir, "_styles.css");

mkdirSync(distDir, { recursive: true });

const t0 = Date.now();

// 1) bundle JS (import JSON จาก shared/data จะถูกฝังมาด้วย)
await build({
  entryPoints: [resolve(webDir, "src/main.js")],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  outfile: tmpBundle,
  loader: { ".json": "json" },
  logLevel: "warning",
});

// 2) CSS
await build({
  entryPoints: [resolve(webDir, "src/ui/styles.css")],
  bundle: true,
  minify: true,
  outfile: tmpCss,
  logLevel: "warning",
});

// 3) ประกอบเป็น index.html ไฟล์เดียว (self-contained: ไม่มี request ภายนอกเลย)
const tpl = readFileSync(resolve(webDir, "index.template.html"), "utf8");
const js = readFileSync(tmpBundle, "utf8");
const css = readFileSync(tmpCss, "utf8");
const html = tpl.replace("{{CSS}}", css).replace("{{BUNDLE}}", js);
writeFileSync(outFile, html);

const kb = (n) => (n / 1024).toFixed(1) + " KB";
console.log("✔ build web/dist/index.html  (" + kb(html.length) + " • js " + kb(js.length) + ", css " + kb(css.length) + ") ใน " + (Date.now() - t0) + "ms");

// คัดลอก index.html ที่ build แล้วไปเป็นหน้า root ของโฟลเดอร์ web (สำหรับ GitHub Pages)
if (existsSync(distDir)) {
  writeFileSync(resolve(webDir, "index.html"), html);
  console.log("✔ คัดลอกเป็น web/index.html (สำหรับ GitHub Pages)");
}
