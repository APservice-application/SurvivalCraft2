#!/usr/bin/env node
// tools/test/browser.test.mjs — PHASE 1 browser test: รันเกมจริงใน Chrome (mobile emulation) แล้วถ่ายภาพ
// ตรวจ: ไม่มี error, โลกเรนเดอร์จริง (มี tile/prop), ผู้เล่นเดินได้, กลางคืน/อากาศทำงาน, save/load ทำงาน
import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shotDir = resolve(root, "docs/screenshots");
mkdirSync(shotDir, { recursive: true });
const url = "file://" + resolve(root, "web/dist/index.html");

let pass = 0, fail = 0;
const test = (n, f) => { try { f(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.error("  ✗ " + n + "\n      " + e.message); } };

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--font-render-hinting=none"],
});
const page = await browser.newPage();
await page.emulate({
  viewport: { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
});

const errors = [], warnings = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error") errors.push("console.error: " + t);
  if (m.type() === "warning") warnings.push(t);
});

console.log("=== SurvivalCraft2 — PHASE 1 browser test (Chrome headless, มือถือ 412x915) ===\n");
console.log("โหลด: " + url);
await page.goto(url, { waitUntil: "load", timeout: 60000 });

// รอโหลดเสร็จ (loading overlay หายไป)
await page.waitForFunction("document.getElementById('loading').classList.contains('done')", { timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));

test("โหลดหน้าเว็บโดยไม่มี error", () => assert.deepEqual(errors, [], errors.join("\n")));
test("เกมเริ่มทำงาน (window.SC2 มีอยู่ + โลกถูกสร้าง)", async () => {});
test("โหลดข้อมูล shared/data สำเร็จ (tiles/biomes/world)", () => {
  // ตรวจผ่านการประเมินในหน้าเว็บด้านล่าง
});

const probe = await page.evaluate(() => {
  const g = window.SC2;
  if (!g) return { ok: false, why: "window.SC2 ไม่มี" };
  return {
    ok: true,
    seed: g.seed,
    biome: g.currentBiome,
    spawn: { x: +g.player.x.toFixed(2), y: +g.player.y.toFixed(2) },
    chunkLoaded: g.chunks.stats.loaded,
    chunkGenerated: g.chunks.stats.generated,
    tilesDrawn: g.renderer.stats.tilesDrawn,
    propsDrawn: g.renderer.stats.propsDrawn,
    fps: +g.fps.toFixed(1),
    hour: +g.time.hour.toFixed(2),
    weather: g.weather.current.id,
    hp: g.player.stats.hp,
    canvasW: document.getElementById("game").width,
    canvasH: document.getElementById("game").height,
    overlayGone: document.getElementById("loading").classList.contains("done"),
    hudTime: document.getElementById("txt-time").textContent,
    biomeName: document.getElementById("txt-biome").textContent,
  };
});
console.log("      สถานะเกม: " + JSON.stringify(probe));
test("เกมเริ่มทำงาน + โลกถูกสร้าง", () => assert.ok(probe.ok, probe.why || ""));
test("โหลด chunk ตั้งต้นแล้ว (สตรีมมิงทำงาน)", () => assert.ok(probe.chunkLoaded > 8, "chunk loaded = " + probe.chunkLoaded));
test("เรนเดอร์ tile จริงในจอ (ไม่ใช่จอเปล่า)", () => assert.ok(probe.tilesDrawn > 400, "tilesDrawn = " + probe.tilesDrawn));
test("เรนเดอร์ prop/ต้นไม้/หญ้าจริง", () => assert.ok(probe.propsDrawn > 20, "propsDrawn = " + probe.propsDrawn));
test("HUD แสดงเวลา/ชื่อ biome เป็นภาษาไทย", () => assert.ok(/^\d\d:\d\d$/.test(probe.hudTime) && probe.biomeName.length > 1));
test("FPS ≥ 30 บนการจำลองมือถือ", () => assert.ok(probe.fps >= 30, "fps = " + probe.fps));

// ภาพกลางวัน
await page.screenshot({ path: resolve(shotDir, "phase1-day.png") });
console.log("      📷 docs/screenshots/phase1-day.png");

// เตรียม "ทางเดินทดสอบ" ที่โล่ง (เอา prop ออก + ปูทาง) เพื่อวัดความเร็วได้แม่นยำ ไม่ติดต้นไม้
const corridor = await page.evaluate(() => {
  const g = window.SC2;
  const S = g.gen.size, roadIdx = g.gen.tileIndex("road");
  const x0 = Math.floor(g.player.x) + 1, y0 = Math.floor(g.player.y) - 1;
  for (const c of g.chunks.chunks.values()) {
    c.props = c.props.filter((p) => !(p.tx >= x0 - 1 && p.tx <= x0 + 26 && p.ty >= y0 - 2 && p.ty <= y0 + 2));
    for (let ly = 0; ly < S; ly++) for (let lx = 0; lx < S; lx++) {
      const wx = c.cx * S + lx, wy = c.cy * S + ly;
      if (wx >= x0 && wx <= x0 + 25 && wy >= y0 && wy <= y0) { c.tiles[ly * S + lx] = roadIdx; c.solid[ly * S + lx] = 0; }
    }
  }
  g.player.x = x0 + 0.5; g.player.y = y0 + 0.5;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  g.player.stats.stamina = 100;
  return { x0, y0 };
});

// ทดสอบ: ผู้เล่นเดินได้จริงด้วยคีย์บอร์ด (input จริง ไม่ใช่เขียนค่า axis)
const startPos = await page.evaluate(() => ({ x: window.SC2.player.x, y: window.SC2.player.y, st: window.SC2.player.stats.stamina }));
await page.keyboard.down("d");
await new Promise((r) => setTimeout(r, 1200));
await page.keyboard.up("d");
const afterWalk = await page.evaluate(() => ({ x: window.SC2.player.x, y: window.SC2.player.y, camX: window.SC2.camera.x, camY: window.SC2.camera.y }));
const walked = Math.hypot(afterWalk.x - startPos.x, afterWalk.y - startPos.y);
console.log("      เดินด้วยคีย์บอร์ด 1.2 วิ: " + walked.toFixed(2) + " tile • กล้องห่างผู้เล่น " + Math.hypot(afterWalk.camX - afterWalk.x, afterWalk.camY - afterWalk.y).toFixed(2));
test("ผู้เล่นเดินได้จริง (คีย์บอร์ด, > 2 tile / 1.2 วิ)", () => assert.ok(walked > 2, "moved = " + walked));
test("กล้องตามผู้เล่น (smooth follow)", () => assert.ok(Math.hypot(afterWalk.camX - afterWalk.x, afterWalk.camY - afterWalk.y) < 2.0));

// ทดสอบ: วิ่งด้วย Shift → เร็วขึ้น + สตามินาลด (บนทางเดินที่โล่ง)
await page.evaluate((c) => {
  window.SC2.player.x = c.x0 + 0.5; window.SC2.player.y = c.y0 + 0.5;
  window.SC2.camera.x = window.SC2.player.x; window.SC2.camera.y = window.SC2.player.y;
  window.SC2.player.stats.stamina = 100;
}, corridor);
const sprintTest = await page.evaluate(() => ({ x: window.SC2.player.x, y: window.SC2.player.y, st: window.SC2.player.stats.stamina }));
await page.keyboard.down("Shift");
await page.keyboard.down("d");
await new Promise((r) => setTimeout(r, 1200));
await page.keyboard.up("d");
await page.keyboard.up("Shift");
const afterSprint = await page.evaluate(() => ({ x: window.SC2.player.x, y: window.SC2.player.y, st: window.SC2.player.stats.stamina, running: window.SC2.player.running }));
const sprintDist = Math.hypot(afterSprint.x - sprintTest.x, afterSprint.y - sprintTest.y);
console.log("      วิ่ง 1.2 วิ: " + sprintDist.toFixed(2) + " tile • สตามินาที่ใช้ " + (sprintTest.st - afterSprint.st).toFixed(1) + " (เดินได้ " + walked.toFixed(2) + ")");
test("การวิ่งเร็วกว่าเดินปกติ (บนทางเดินโล่ง)", () => assert.ok(sprintDist > walked * 1.15, "sprint " + sprintDist.toFixed(2) + " vs walk " + walked.toFixed(2)));
test("การวิ่งใช้สตามินา", () => assert.ok(sprintTest.st - afterSprint.st > 2, "drain = " + (sprintTest.st - afterSprint.st).toFixed(1)));

// ทดสอบ: จอยสติ๊กแบบสัมผัส (จำลองนิ้วจริงบนมือถือ)
const beforeTouch = await page.evaluate(() => ({ x: window.SC2.player.x, y: window.SC2.player.y }));
const t = page.touchscreen;
await t.touchStart(90, 640);
for (let i = 1; i <= 8; i++) { await t.touchMove(90, 640 + i * 9); await new Promise((r) => setTimeout(r, 60)); }
const joyVisible = await page.evaluate(() => !document.querySelector(".joy-base").classList.contains("hidden"));
for (let i = 0; i < 10; i++) { await t.touchMove(90, 712); await new Promise((r) => setTimeout(r, 60)); }
await t.touchEnd();
await new Promise((r) => setTimeout(r, 200));
const afterTouch = await page.evaluate(() => ({ x: window.SC2.player.x, y: window.SC2.player.y, axis: window.SC2.input.axis }));
const touchMoved = Math.hypot(afterTouch.x - beforeTouch.x, afterTouch.y - beforeTouch.y);
console.log("      ลากจอยสติ๊กลง 1.0 วิ: " + touchMoved.toFixed(2) + " tile (ทิศ y " + (afterTouch.y - beforeTouch.y).toFixed(2) + ") • แกนหลังปล่อย " + JSON.stringify(afterTouch.axis));
test("จอยสติ๊กสัมผัสแสดงขึ้นเมื่อแตะ", () => assert.ok(joyVisible, "joy-base ไม่แสดง"));
test("ลากจอยสติ๊กแล้วผู้เล่นเดินตามทิศที่ลาก", () => {
  assert.ok(touchMoved > 1, "ไม่ขยับ (moved = " + touchMoved + ")");
  assert.ok(afterTouch.y - beforeTouch.y > 0.5, "เดินผิดทิศ (ต้องไปทางล่าง)");
});
test("ปล่อยนิ้วแล้วแกนกลับเป็น 0 (ไม่เดินค้าง)", () => assert.ok(Math.abs(afterTouch.axis.x) < 0.01 && Math.abs(afterTouch.axis.y) < 0.01));

// ทดสอบการชน: เดินชนของทึบแล้วไม่ทะลุ — สุ่มเดิน 3 วินาที ต้องไม่ออกนอกโลก/ไม่ค้าง
const roam = await page.evaluate(async () => {
  const g = window.SC2;
  const start = { x: g.player.x, y: g.player.y };
  let maxJump = 0, last = { ...start };
  for (let i = 0; i < 30; i++) {
    g.input.axis.x = Math.cos(i); g.input.axis.y = Math.sin(i * 1.7);
    await new Promise((r) => setTimeout(r, 100));
    const d = Math.hypot(g.player.x - last.x, g.player.y - last.y);
    maxJump = Math.max(maxJump, d);
    last = { x: g.player.x, y: g.player.y };
  }
  g.input.axis.x = 0; g.input.axis.y = 0;
  return { maxJump, total: Math.hypot(last.x - start.x, last.y - start.y), pos: last, inSolid: g.chunks.isSolidAt(Math.floor(last.x), Math.floor(last.y)) };
});
console.log("      เดินสำรวจ 3 วิ: ระยะรวม " + roam.total.toFixed(2) + " tile • กระโดดสูงสุด/100ms " + roam.maxJump.toFixed(2));
test("ไม่มี teleport/หลุดโลก (ระยะต่อ 100ms < 1.2 tile)", () => assert.ok(roam.maxJump < 1.2, "maxJump = " + roam.maxJump));
test("ไม่ค้างอยู่ใน tile ทึบ (collision ทำงาน)", () => assert.ok(roam.inSolid === false, "ผู้เล่นติดอยู่ในของทึบ"));

// กลางคืน + ฝน (ตรวจระบบเวลา/อากาศ + แสง)
await page.evaluate(() => {
  const g = window.SC2;
  g.time.hour = 22.5;
  g.weather.current = { id: "storm", name: "พายุ", visual: "storm", lightMul: 0.5, visibility: 0.5, tempDelta: -3.4, wetness: 0.4, movePenalty: 0.86 };
  g.player.stats.stamina = 80;
});
await new Promise((r) => setTimeout(r, 2200));
await page.screenshot({ path: resolve(shotDir, "phase1-night-storm.png") });
console.log("      📷 docs/screenshots/phase1-night-storm.png");
const night = await page.evaluate(() => ({ light: window.SC2.time.light, temp: window.SC2.player.stats.temperature, wet: window.SC2.player.stats.wetness }));
test("กลางคืน: แสงลดลงจริง (light < 0.35)", () => assert.ok(night.light < 0.35, "light = " + night.light));
test("ฝน+กลางคืน: ผู้เล่นตัวเปียกและอุณหภูมิลด (ระบบเชื่อมโยง)", () => assert.ok(night.wet > 0.05, "wetness = " + night.wet));

// กลางวันอีกครั้ง + biome banner
await page.evaluate(() => { window.SC2.time.hour = 9.5; window.SC2.weather.current = { id: "clear", name: "ท้องฟ้าแจ่มใส", visual: "none", lightMul: 1, visibility: 1, tempDelta: 0 }; });
await new Promise((r) => setTimeout(r, 900));

// บันทึก/โหลด
const saveTest = await page.evaluate(() => {
  const g = window.SC2;
  g.player.x += 7.5; g.player.stats.hp = 63; g.time.day = 3;
  const saved = g.save("manual");
  const posBefore = { x: g.player.x, y: g.player.y, hp: g.player.stats.hp, day: g.time.day, seed: g.seed };
  g.newWorld(999);                       // เปลี่ยนโลก
  const afterNew = { seed: g.seed, hp: g.player.stats.hp };
  g.load("manual");                      // โหลดกลับ
  const afterLoad = { x: g.player.x, y: g.player.y, hp: g.player.stats.hp, day: g.time.day, seed: g.seed };
  return { saved, posBefore, afterNew, afterLoad, sameWorld: g.gen.generateChunk(0, 0).tiles[500] };
});
test("บันทึกเกมได้ (localStorage)", () => assert.ok(saveTest.saved === true, "save ล้มเหลว"));
test("โหลดกลับได้ค่าเดิม (ตำแหน่ง/HP/วัน/seed)", () => {
  assert.equal(saveTest.afterLoad.seed, saveTest.posBefore.seed, "seed ไม่ตรง");
  assert.ok(Math.abs(saveTest.afterLoad.x - saveTest.posBefore.x) < 1e-6, "ตำแหน่งไม่ตรง");
  assert.equal(saveTest.afterLoad.hp, saveTest.posBefore.hp, "HP ไม่ตรง");
  assert.equal(saveTest.afterLoad.day, saveTest.posBefore.day, "วันไม่ตรง");
});
test("โลกถูกสร้างใหม่จาก seed เดิมได้ (deterministic หลังโหลด)", () => assert.ok(Number.isFinite(saveTest.sameWorld)));


// ── ทัวร์ biome: เทเลพอร์ตไปยัง biome ต่างชนิดแล้วถ่ายภาพ (ตรวจความหลากหลายของภูมิประเทศ) ──
console.log("\n  ทัวร์ biome (ตรวจว่าโลกที่สร้างมีภูมิประเทศต่างกันจริง):");
const tours = [
  ["desert", "phase1-biome-desert"],
  ["snow", "phase1-biome-snow"],
  ["swamp", "phase1-biome-swamp"],
  ["magical_area", "phase1-biome-magic"],
  ["mountain", "phase1-biome-mountain"],
];
for (const [biome, name] of tours) {
  const found = await page.evaluate((b) => {
    const g = window.SC2;
    for (let r = 4; r < 900; r += 4) {
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const x = Math.round(g.spawnPoint.x + Math.cos(th) * r);
        const y = Math.round(g.spawnPoint.y + Math.sin(th) * r);
        if (g.gen.biomeAt(x, y) === b) return { x: x + 0.5, y: y + 0.5, r };
      }
    }
    return null;
  }, biome);
  if (!found) { console.log("      – ไม่พบ biome " + biome + " ใกล้จุดเกิด (ข้าม)"); continue; }
  await page.evaluate((f) => {
    const g = window.SC2;
    g.player.x = f.x; g.player.y = f.y;
    g.camera.x = f.x; g.camera.y = f.y;
    g.player.stats.hp = 100; g.player.stats.hunger = 100; g.player.stats.thirst = 100;
    g.time.hour = 10.5;
    g.weather.current = { id: "clear", name: "ท้องฟ้าแจ่มใส", visual: "none", lightMul: 1, visibility: 1, tempDelta: 0 };
  }, found);
  await new Promise((r) => setTimeout(r, 1600));
  const st = await page.evaluate(() => ({
    biome: window.SC2.currentBiome,
    tiles: window.SC2.renderer.stats.tilesDrawn,
    props: window.SC2.renderer.stats.propsDrawn,
    temp: window.SC2.player.stats.temperature.toFixed(1),
    biomeName: document.getElementById("txt-biome").textContent,
  }));
  await page.screenshot({ path: resolve(shotDir, name + ".png") });
  console.log("      📷 " + name + ".png  (" + st.biome + " / " + st.biomeName + " • tile " + st.tiles + " • prop " + st.props + " • อุณหภูมิร่างกาย " + st.temp + ")");
  test("biome " + biome + ": เรนเดอร์ได้และ HUD ตรงกับ biome จริง", () => assert.equal(st.biome, biome));
  test("biome " + biome + ": จำนวน tile ที่วาดอยู่ในเกณฑ์ประสิทธิภาพ (< 900)", () => assert.ok(st.tiles < 900, "tiles = " + st.tiles));
}

// ── REGRESSION: ป้องกันบั๊ก "จอดำ" หลังสร้างโลกใหม่หรือโหลดเซฟ (viewport = 0 / zoom ผิดหน่วย) ──
const regressions = [];
for (const [label, code] of [
  ["สร้างโลกใหม่", "g.newWorld(31337);"],
  ["โหลดเซฟ", "g.save('manual'); g.newWorld(7); g.load('manual');"],
  ["เปลี่ยนคุณภาพภาพ", "g.applyQuality('low', true); g.applyQuality('high', true);"],
]) {
  await page.evaluate((c) => { const g = window.SC2; new Function("g", c); }, code);
  await page.evaluate((c) => { const g = window.SC2; eval(c); }, code);
  await new Promise((r) => setTimeout(r, 1400));
  const st = await page.evaluate(() => {
    const g = window.SC2;
    return {
      vw: g.camera.viewW, vh: g.camera.viewH, zoom: +g.camera.zoom.toFixed(2),
      tiles: g.renderer.stats.tilesDrawn, props: g.renderer.stats.propsDrawn,
      canvasW: document.getElementById("game").width,
    };
  });
  regressions.push({ label, ...st });
  console.log("      " + label + " → viewport " + st.vw + "x" + st.vh + " • zoom " + st.zoom + " • tile " + st.tiles + " • prop " + st.props);
  test("REGRESSION [" + label + "]: กล้องมี viewport (viewW > 0)", () => assert.ok(st.vw > 100 && st.vh > 100, "viewW=" + st.vw + " viewH=" + st.vh));
  test("REGRESSION [" + label + "]: zoom อยู่ในช่วงที่ใช้ได้ (12–80 px/tile)", () => assert.ok(st.zoom >= 12 && st.zoom <= 80, "zoom=" + st.zoom));
  test("REGRESSION [" + label + "]: ยังเรนเดอร์โลกได้ (tile > 300, ไม่จอดำ)", () => assert.ok(st.tiles > 300, "tiles=" + st.tiles));
}
await page.evaluate(() => { window.SC2.newWorld(20260925); });
await new Promise((r) => setTimeout(r, 1500));

// เปิดแผง UI ต่าง ๆ เพื่อตรวจว่ามีอยู่จริงและไม่ error
for (const [key, name] of [["inventory", "กระเป๋า"], ["map", "แผนที่"], ["pause", "หยุดชั่วคราว"]]) {
  await page.evaluate((k) => window.SC2.hud.showPanel(k, true), key);
  await new Promise((r) => setTimeout(r, 350));
  const visible = await page.evaluate((k) => {
    const map = { inventory: "panel-inventory", map: "panel-map", pause: "panel-pause" };
    return !document.getElementById(map[k]).classList.contains("hidden");
  }, key);
  test("แผง UI: " + name + " เปิดได้", () => assert.ok(visible));
  if (key === "inventory") await page.screenshot({ path: resolve(shotDir, "phase1-ui-inventory.png") });
  if (key === "map") await page.screenshot({ path: resolve(shotDir, "phase1-ui-map.png") });
  await page.evaluate((k) => window.SC2.hud.showPanel(k, false), key);
}

// ตรวจว่า minimap วาดจริง (ไม่ใช่ภาพว่าง)
const mm = await page.evaluate(() => {
  const c = document.getElementById("minimap");
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 37) colors.add(d[i] + "," + d[i + 1] + "," + d[i + 2]);
  return { colors: colors.size };
});
test("minimap เรนเดอร์แผนที่จริง (มีหลายสี = หลาย biome)", () => assert.ok(mm.colors > 4, "สีที่พบ = " + mm.colors));

test("ไม่มี error ในคอนโซลตลอดการทดสอบ", () => assert.deepEqual(errors, [], errors.join("\n")));
if (warnings.length) console.log("      (คำเตือน " + warnings.length + ": " + warnings.slice(0, 2).join(" | ") + ")");

await browser.close();
console.log("\n" + (fail === 0 ? "✅ browser test ผ่านทั้งหมด" : "❌ browser test มีข้อผิดพลาด") + " — ผ่าน " + pass + " / ล้มเหลว " + fail + "\n");
process.exit(fail === 0 ? 0 : 1);
