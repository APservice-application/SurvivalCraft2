#!/usr/bin/env node
// tools/test/determinism.mjs — ทดสอบว่าโลกที่สร้างจาก "seed เดียวกัน" เหมือนกันทั้ง Web และ Godot
// (Spec ข้อ 4: Seed เดิมต้องให้โลกเหมือนเดิมในระดับ deterministic)
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const tiles = load("shared/data/tiles.json");
const biomes = load("shared/data/biomes.json");
const world = load("shared/data/world.json");
const { WorldGen } = await import(resolve(root, "web/src/world/worldgen.js"));
const { mul32 } = await import(resolve(root, "web/src/core/math.js"));

const SEED = world.world.defaultSeed;
const hasher = (arr) => { let h = 2166136261; for (const v of arr) h = mul32(h ^ v, 16777619); return h; };

// ── ฝั่งเว็บ ──
const gen = new WorldGen(world, tiles, biomes, SEED);
const jsOut = [];
for (const [cx, cy] of [[0, 0], [1, 2], [-3, 4]]) {
  const c = gen.generateChunk(cx, cy);
  const ph = [];
  for (const p of c.props) { ph.push(p.type.length); ph.push(Math.round(p.x * 100)); }
  jsOut.push({ cx, cy, tilesHash: hasher(Array.from(c.tiles)), props: c.props.length, propsHash: hasher(ph), biome: c.biome });
}
const jsSpawn = gen.findSpawn(0, 0);
console.log("── ฝั่งเว็บ (web/src/world/worldgen.js) ──");
for (const c of jsOut) console.log(`  CHUNK ${c.cx},${c.cy} tilesHash=${c.tilesHash} props=${c.props} propsHash=${c.propsHash} biome=${c.biome}`);
console.log(`  SPAWN ${jsSpawn.x.toFixed(1)},${jsSpawn.y.toFixed(1)} ${jsSpawn.biome}`);

// ── ฝั่ง Godot ──
const godotBin = process.env.GODOT_BIN || "godot";
let gdOut = null;
try {
  const stdout = execFileSync(godotBin, ["--headless", "--path", resolve(root, "godot"), "--script", "res://scripts/tests/HeadlessDeterminism.gd"], { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] });
  gdOut = stdout;
} catch (e) {
  console.log("\n⚠ ข้ามการทดสอบฝั่ง Godot: ไม่พบไบนารี Godot (ตั้งค่า GODOT_BIN ได้)");
  console.log("  " + (e.message || "").split("\n")[0]);
  process.exit(0);
}

console.log("\n── ฝั่ง Godot (godot/scripts/WorldGen.gd) ──");
const parse = (re) => {
  const out = [];
  for (const line of gdOut.split("\n")) {
    const m = line.match(re);
    if (m) out.push(m);
  }
  return out;
};
const gdChunks = parse(/CHUNK (-?\d+),(-?\d+) tilesHash=(\d+) props=(\d+) propsHash=(\d+) biome=(\w+)/);
const gdSpawn = gdOut.match(/SPAWN ([\d.-]+),([\d.-]+) (\w+)/);
for (const m of gdChunks) console.log(`  CHUNK ${m[1]},${m[2]} tilesHash=${m[3]} props=${m[4]} propsHash=${m[5]} biome=${m[6]}`);

// ── เปรียบเทียบ ──
let fail = 0;
console.log("\n── ผลเปรียบเทียบ ──");
if (gdChunks.length !== jsOut.length) { console.error("✗ จำนวน chunk ที่ทดสอบไม่ตรงกัน"); fail++; }
for (let i = 0; i < Math.min(gdChunks.length, jsOut.length); i++) {
  const g = gdChunks[i], j = jsOut[i];
  // เทียบแบบ unsigned 32-bit (JS คืนค่า signed, Godot คืนค่า unsigned — บิตเดียวกัน)
  const u = (n) => (n >>> 0);
  const same = u(Number(g[3])) === u(j.tilesHash) && Number(g[4]) === j.props && u(Number(g[5])) === u(j.propsHash) && g[6] === j.biome;
  console.log(`  ${same ? "✓" : "✗"} chunk ${j.cx},${j.cy}: tiles ${u(Number(g[3]))}=${u(j.tilesHash)} • props ${g[4]}=${j.props} • propsHash ${u(Number(g[5]))}=${u(j.propsHash)} • biome ${g[6]}=${j.biome}`);
  if (!same) fail++;
}
if (gdSpawn) {
  const sameSpawn = Math.abs(Number(gdSpawn[1]) - jsSpawn.x) < 1e-6 && Math.abs(Number(gdSpawn[2]) - jsSpawn.y) < 1e-6 && gdSpawn[3] === jsSpawn.biome;
  console.log(`  ${sameSpawn ? "✓" : "✗"} จุดเกิด: ${gdSpawn[1]},${gdSpawn[2]} ${gdSpawn[3]} = ${jsSpawn.x.toFixed(1)},${jsSpawn.y.toFixed(1)} ${jsSpawn.biome}`);
  if (!sameSpawn) fail++;
}
console.log("");
if (fail === 0) { console.log("✅ Web และ Godot สร้างโลกจาก seed เดียวกันได้เหมือนกันเป๊ะ (cross-frontend determinism)"); process.exit(0); }
console.error("❌ โลกของสอง frontend ไม่ตรงกัน — ต้องแก้ WorldGen ให้ตรงกันก่อนไป Phase ถัดไป"); process.exit(1);
