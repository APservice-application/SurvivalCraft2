#!/usr/bin/env node
// tools/test/iframe.test.mjs — ตรวจว่าเกมรันได้ใน sandboxed iframe (allow-scripts เท่านั้น)
// สำคัญ: preview ในแอปใช้ sandbox="allow-scripts" → localStorage เข้าไม่ได้ ต้องไม่ throw
import puppeteer from "puppeteer";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = resolve(root, "web/dist");
const wrapperPath = resolve(distDir, "_preview-wrapper.html");

// สร้าง wrapper เองทุกครั้ง (โฟลเดอร์ dist ไม่ถูก commit → CI ต้องสร้างได้เอง)
if (!existsSync(resolve(distDir, "index.html"))) {
  console.error("ไม่พบ web/dist/index.html — รัน `npm run build` ก่อน");
  process.exit(1);
}
mkdirSync(distDir, { recursive: true });
writeFileSync(wrapperPath, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>preview wrapper</title>
<style>html,body{margin:0;height:100%;background:#111}iframe{width:100%;height:100%;border:0}</style></head>
<body><iframe id="f" sandbox="allow-scripts" src="index.html"></iframe></body></html>`);
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage();
await page.emulate({ viewport: { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, userAgent: "Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile" });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto("file://" + wrapperPath, { waitUntil: "load", timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const frame = page.frames().find((f) => f.url().endsWith("index.html"));
const st = frame ? await frame.evaluate(() => {
  const g = window.SC2;
  return { hasGame: !!g, tiles: g ? g.renderer.stats.tilesDrawn : 0, loaded: !!document.getElementById("loading").classList.contains("done"), saveAvailable: g ? (typeof g.save === "function" && g.save("manual")) : null };
}) : null;

let pass = 0, fail = 0;
const test = (n, f) => { try { f(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.error("  ✗ " + n + "\n      " + e.message); } };
console.log("=== SurvivalCraft2 — sandboxed iframe test (แบบเดียวกับ preview ในแอป) ===\n");
test("เกมโหลดและรันใน sandbox iframe (allow-scripts)", () => assert.ok(st && st.hasGame, "ไม่พบ window.SC2 ใน iframe"));
test("เรนเดอร์โลกได้ใน iframe", () => assert.ok(st.tiles > 300, "tiles = " + (st ? st.tiles : "n/a")));
test("ไม่มี error แม้ localStorage เข้าไม่ได้", () => assert.deepEqual(errors, [], errors.join(" | ")));
test("การบันทึกเกมล้มเหลวอย่างปลอดภัย (ไม่ throw) เมื่อไม่มี storage", () => assert.ok(st.saveAvailable === false || st.saveAvailable === true));
await browser.close();
console.log("\n" + (fail === 0 ? "✅ iframe test ผ่านทั้งหมด" : "❌ iframe test มีข้อผิดพลาด") + " — ผ่าน " + pass + " / ล้มเหลว " + fail + "\n");
process.exit(fail === 0 ? 0 : 1);
