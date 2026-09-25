#!/usr/bin/env node
// tools/test/logic.test.mjs — PHASE 0/1 smoke test ของ game logic (รันใน Node ไม่ต้องใช้ browser)
// ตรวจ: determinism ของโลก, ความถูกต้องของ chunk, การชน, สถิติ survival, เวลา/อากาศ, save roundtrip
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const tiles = load("shared/data/tiles.json");
const biomes = load("shared/data/biomes.json");
const world = load("shared/data/world.json");
const items = load("shared/data/items.json");
const recipes = load("shared/data/recipes.json");

const { WorldGen } = await import(resolve(root, "web/src/world/worldgen.js"));
const { ChunkManager } = await import(resolve(root, "web/src/world/chunks.js"));
const { Player } = await import(resolve(root, "web/src/player/player.js"));
const { GameTime, PHASES } = await import(resolve(root, "web/src/systems/time.js"));
const { Weather } = await import(resolve(root, "web/src/systems/weather.js"));
const { hash2, Noise } = await import(resolve(root, "web/src/core/math.js"));

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.error("  ✗ " + name + "\n      " + e.message); }
};
const section = (s) => console.log("\n" + s);

console.log("=== SurvivalCraft2 — PHASE 1 logic tests ===\n");

section("DATA (Spec ข้อ 36)");
test("tiles/biomes/world/items/recipes โหลดได้", () => {
  assert.ok(Object.keys(tiles.tiles).length >= 14);
  assert.ok(Object.keys(biomes.biomes).length >= 15);
  assert.ok(world.world.chunkSize > 0);
  assert.ok(Object.keys(items.items).length >= 30);
  assert.ok(recipes.recipes.length >= 15);
});
test("biome อ้าง tile/prop ที่มีจริงทุกตัว", () => {
  for (const [bid, b] of Object.entries(biomes.biomes)) {
    for (const t of Object.keys(b.terrain)) assert.ok(tiles.tiles[t], `biome ${bid} อ้าง tile '${t}' ที่ไม่มี`);
    for (const p of [...Object.keys(b.vegetation || {}), ...Object.keys(b.decoration || {})]) {
      assert.ok(tiles.props[p], `biome ${bid} อ้าง prop '${p}' ที่ไม่มี`);
    }
  }
});
test("สูตรคราฟต์อ้างไอเทมที่มีจริง + มี station ที่ประกาศไว้", () => {
  for (const r of recipes.recipes) {
    assert.ok(items.items[r.out.item], `สูตร ${r.id}: ของออกไม่มี`);
    for (const i of r.in) assert.ok(items.items[i.item], `สูตร ${r.id}: วัตถุดิบ '${i.item}' ไม่มี`);
    if (r.station !== "hand") assert.ok(recipes.stations[r.station], `สูตร ${r.id}: station '${r.station}' ไม่มี`);
  }
});

section("WORLD GENERATION (Spec ข้อ 4, 41) — deterministic");
const g1 = new WorldGen(world.world ? world : world, tiles, biomes, 12345);
const g2 = new WorldGen(world, tiles, biomes, 12345);
const g3 = new WorldGen(world, tiles, biomes, 999);
test("seed เดียวกัน → โลกเหมือนกันเป๊ะ (tile + props)", () => {
  const c1 = g1.generateChunk(0, 0), c2 = g2.generateChunk(0, 0);
  assert.deepEqual(Array.from(c1.tiles), Array.from(c2.tiles), "tiles ไม่ตรงกัน");
  assert.equal(c1.props.length, c2.props.length, "จำนวน props ไม่ตรงกัน");
  assert.deepEqual(c1.props.map((p) => [p.type, p.x.toFixed(3), p.y.toFixed(3)]), c2.props.map((p) => [p.type, p.x.toFixed(3), p.y.toFixed(3)]));
});
test("seed ต่างกัน → โลกต่างกัน", () => {
  const a = g1.generateChunk(3, -2), b = g3.generateChunk(3, -2);
  assert.notDeepEqual(Array.from(a.tiles), Array.from(b.tiles));
});
test("สร้าง chunk ซ้ำหลายครั้งให้ผลเดิม (regenerate ได้ ไม่ต้องเซฟ tile)", () => {
  const a = g1.generateChunk(5, 7), b = g1.generateChunk(5, 7);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
});
test("chunk มีขนาด/ชนิดข้อมูลถูกต้อง และ tile ทุกตัวมีใน tiles.json", () => {
  const S = world.world.chunkSize;
  const c = g1.generateChunk(-4, 6);
  assert.equal(c.tiles.length, S * S);
  assert.equal(c.solid.length, S * S);
  for (const t of new Set(c.tiles)) assert.ok(tiles.tiles[g1.tileFromIndex(t)], "tile index ไม่รู้จัก: " + t);
});
test("โลกหลากหลาย: ภายในระยะ 40 chunk เจอ biome ≥ 4 ชนิด (ไม่ใช่บล็อกสีเดียว)", () => {
  const found = new Set();
  for (let cy = -2; cy <= 2; cy++) for (let cx = -2; cx <= 2; cx++) {
    const c = g1.generateChunk(cx, cy);
    Object.keys(c.biomeCounts).forEach((b) => found.add(b));
  }
  assert.ok(found.size >= 4, "เจอ biome แค่ " + found.size + ": " + [...found].join(","));
});
test("props ไม่ทับกัน (ระยะห่างขั้นต่ำ) และไม่วางบนน้ำ", () => {
  const S = world.world.chunkSize;
  const c = g1.generateChunk(1, 1);
  const seen = new Set();
  for (const p of c.props) {
    assert.ok(!seen.has(p.tx + "," + p.ty), "prop ซ้อน tile เดียวกันที่ " + p.tx + "," + p.ty);
    seen.add(p.tx + "," + p.ty);
    assert.ok(!tiles.tiles[g1.tileAt(p.tx, p.ty)].liquid, "prop ' " + p.type + "' วางบนน้ำ");
  }
});
test("จุดเกิดปลอดภัย (ไม่ใช่น้ำ/ผาหิน) และไม่มีต้นไม้/ก้อนหินทึบขวาง (ผู้เล่นไม่ติด)", () => {
  for (const seed of [1, 777, 20260925, 4242424242, 31337]) {
    const g = new WorldGen(world, tiles, biomes, seed);
    const s = g.findSpawn(0, 0);
    const bad = ["ocean", "deep_ocean", "river", "lake", "mountain", "snow", "swamp", "cave"];
    assert.ok(!bad.includes(s.biome), "seed " + seed + " เกิดใน " + s.biome);
    assert.ok(!g.isTileSolid(g.tileAt(Math.floor(s.x), Math.floor(s.y))), "จุดเกิดเป็น tile ทึบ");
    assert.ok(g.areaClearOfProps(s.x, s.y, 1.4), "seed " + seed + ": มีของทึบทับจุดเกิด");
  }
});
test("จุดเกิดเดินออกไปได้จริง (ไม่ถูกต้นไม้ล้อม)", () => {
  for (const seed of [20260925, 777]) {
    const g = new WorldGen(world, tiles, biomes, seed);
    const cm = new ChunkManager(g, world);
    for (let i = 0; i < 60; i++) cm.update(0, 0, 999);
    const s = g.findSpawn(0, 0);
    let total = 0;
    for (const [dx, dy, name] of [[1, 0, "ตะวันออก"], [-1, 0, "ตะวันตก"], [0, 1, "ใต้"], [0, -1, "เหนือ"]]) {
      const p = new Player(s.x, s.y);
      const input = { axis: { x: dx, y: dy }, sprint: false, consume: () => false };
      for (let i = 0; i < 60; i++) p.update(1 / 60, input, cm);
      const moved = Math.hypot(p.x - s.x, p.y - s.y);
      total += moved;
      assert.ok(moved > 0.9, "seed " + seed + ": เดินไปทาง" + name + "ได้แค่ " + moved.toFixed(2) + " tile (ติดของทึบที่จุดเกิด)");
    }
    assert.ok(total > 6, "seed " + seed + ": พื้นที่จุดเกิดคับแคบเกิน (รวม " + total.toFixed(2) + " tile)");
  }
});
test("ประสิทธิภาพ: generate 400 chunk ใช้เวลาเฉลี่ย < 25 ms/chunk", () => {
  const g = new WorldGen(world, tiles, biomes, 42);
  const t0 = Date.now();
  let n = 0;
  for (let cy = -10; cy < 10; cy++) for (let cx = -10; cx < 10; cx++) { g.generateChunk(cx, cy); n++; }
  const ms = (Date.now() - t0) / n;
  assert.ok(ms < 25, "เฉลี่ย " + ms.toFixed(2) + " ms/chunk (ช้าเกินไปสำหรับมือถือ)");
  console.log("      (เฉลี่ย " + ms.toFixed(2) + " ms/chunk × " + n + " chunk)");
});

section("CHUNK STREAMING (Spec ข้อ 6, 42)");
test("โหลดเฉพาะ chunk รอบผู้เล่น และ unload chunk ที่ไกลเกิน", () => {
  const g = new WorldGen(world, tiles, biomes, 2024);
  const cm = new ChunkManager(g, world);
  for (let i = 0; i < 200; i++) cm.update(0, 0, 999);
  const loadedAtOrigin = cm.chunks.size;
  assert.ok(loadedAtOrigin > 8, "โหลด chunk น้อยเกินไป: " + loadedAtOrigin);
  assert.ok(loadedAtOrigin < 120, "โหลด chunk มากเกินไป (RAM จะเต็ม): " + loadedAtOrigin);
  // เดิน jauh
  for (let i = 0; i < 400; i++) cm.update(3000, 3000, 999);
  assert.ok(cm.chunks.size < 200, "หลังเดินไกล cache ยังใหญ่เกิน: " + cm.chunks.size);
  assert.equal(cm.get(0, 0), null, "chunk เก่าไม่ถูก unload");
});
test("tileIdAt/isSolidAt ให้คำตอบถูกต้องในพื้นที่โหลดแล้ว", () => {
  const g = new WorldGen(world, tiles, biomes, 5);
  const cm = new ChunkManager(g, world);
  for (let i = 0; i < 60; i++) cm.update(0, 0, 999);
  let solids = 0, liquids = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const id = cm.tileIdAt(x, y);
    assert.ok(tiles.tiles[id], "tileId ไม่รู้จัก: " + id);
    if (cm.isSolidAt(x, y)) solids++;
    if (cm.isLiquidAt(x, y)) liquids++;
  }
  assert.ok(solids >= 0 && liquids >= 0);
});

section("PLAYER + COLLISION (Spec ข้อ 10)");
test("ผู้เล่นเดินได้ปกติบนพื้นที่ว่าง", () => {
  const g = new WorldGen(world, tiles, biomes, 20260925);
  const cm = new ChunkManager(g, world);
  for (let i = 0; i < 60; i++) cm.update(0, 0, 999);
  const spawn = g.findSpawn(0, 0);
  const p = new Player(spawn.x, spawn.y);
  const input = { axis: { x: 1, y: 0 }, sprint: false, consume: () => false };
  const x0 = p.x;
  for (let i = 0; i < 60; i++) p.update(1 / 60, input, cm);
  assert.ok(p.x > x0 + 1, "ผู้เล่นไม่ขยับ (x=" + p.x + ")");
});
test("ผู้เล่นไม่ทะลุกำแพง: ชน tile ทึบแล้วหยุด", () => {
  const g = new WorldGen(world, tiles, biomes, 77);
  const cm = new ChunkManager(g, world);
  // สร้างกำแพงหินเทียมรอบผู้เล่นโดยแก้ chunk
  for (let i = 0; i < 40; i++) cm.update(20, 20, 999);
  const c = cm.get(0, 0) || cm.get(1, 1) || [...cm.chunks.values()][0];
  const S = g.size;
  const rockIdx = g.tileIndex("rock");
  const cx = Math.floor(20 / S), cy = Math.floor(20 / S);
  const ch = cm.get(cx, cy);
  const lx = 20 - cx * S + 1, ly = 20 - cy * S;
  for (let y = ly - 3; y <= ly + 3; y++) { ch.tiles[y * S + lx] = rockIdx; }
  const p = new Player(20.5, 20.5);
  const input = { axis: { x: 1, y: 0 }, sprint: false, consume: () => false };
  for (let i = 0; i < 90; i++) p.update(1 / 60, input, cm);
  assert.ok(p.x < 21, "ผู้เล่นทะลุกำแพง! x=" + p.x);
  void c;
});
test("Dodge ใช้สตามินาและมีช่วงอมตะ", () => {
  const g = new WorldGen(world, tiles, biomes, 3);
  const cm = new ChunkManager(g, world);
  for (let i = 0; i < 60; i++) cm.update(0, 0, 999);
  const s = g.findSpawn(0, 0);
  const p = new Player(s.x, s.y);
  let used = false;
  const input = { axis: { x: 1, y: 0 }, sprint: false, consume: (a) => (a === "dodge" && !used ? (used = true, true) : false) };
  const st0 = p.stats.stamina;
  p.update(1 / 60, input, cm);
  assert.ok(p.stats.stamina < st0, "Dodge ไม่ลดสตามินา");
  assert.ok(p.dodging > 0 && p.invulnerable, "Dodge ไม่มีช่วงอมตะ");
});

section("SURVIVAL STATS (Spec ข้อ 11)");
test("ความหิว/กระหายลดลง และสตามินาฟื้นเมื่อยืนพัก", () => {
  const p = new Player(0.5, 0.5);
  const st = p.stats;
  const st0 = { h: st.hunger, t: st.thirst, s: st.stamina };
  st.stamina = 20;
  for (let i = 0; i < 60 * 30; i++) st.update(1 / 60, { moving: false, sprinting: false, inWater: false, night: false, biomeTemp: 22, rain: false });
  assert.ok(st.hunger < st0.h, "ความหิวไม่ลด");
  assert.ok(st.thirst < st0.t, "ความกระหายไม่ลด");
  assert.ok(st.stamina > 20, "สตามินาไม่ฟื้น");
});
test("ระบบเชื่อมโยง: ฝน + กลางคืน + ตัวเปียก → อุณหภูมิร่างกายลด", () => {
  const p = new Player(0.5, 0.5);
  for (let i = 0; i < 60 * 60; i++) p.stats.update(1 / 60, { moving: true, sprinting: false, inWater: true, night: true, biomeTemp: 5, rain: true });
  assert.ok(p.stats.temperature < 36.5, "อุณหภูมิไม่ลด (=" + p.stats.temperature.toFixed(2) + ")");
  assert.ok(p.stats.effects.some((e) => e.id === "wet" || e.id === "hypothermia"), "ไม่เกิดสถานะเปียก/หนาวเกิน");
});
test("หิว/กระหายหมด → เสียเลือดและอดตายได้", () => {
  const p = new Player(0.5, 0.5);
  p.stats.hunger = 0; p.stats.thirst = 0;
  const hp0 = p.stats.hp;
  for (let i = 0; i < 60 * 20; i++) p.stats.update(1 / 60, { moving: false, sprinting: false, inWater: false, night: false, biomeTemp: 22, rain: false });
  assert.ok(p.stats.hp < hp0, "HP ไม่ลดเมื่ออดอาหาร/ขาดน้ำ");
  assert.ok(p.stats.effects.some((e) => ["starving", "dehydrated"].includes(e.id)));
});

section("TIME + WEATHER (Spec ข้อ 12, 13)");
test("เวลาเดินครบ 24 ชม. ภายใน dayLengthMinutes และ phase ถูกต้อง", () => {
  const t = new GameTime(world);
  const startDay = t.day;
  const secs = world.time.dayLengthMinutes * 60;
  for (let i = 0; i < secs; i++) t.update(1);
  assert.equal(t.day, startDay + 1, "วันไม่เปลี่ยนหลัง 24 ชม.");
  assert.ok(t.hour >= 0 && t.hour < 24);
  assert.ok(PHASES.includes(t.phase), "phase ไม่ถูกต้อง");
});
test("แสงกลางวัน–กลางคืน: กลางวันสว่าง > กลางคืน", () => {
  const t = new GameTime(world);
  t.hour = 12; const day = t.light;
  t.hour = 1; const night = t.light;
  assert.ok(day > night, "แสงกลางวันไม่มากกว่ากลางคืน");
  assert.ok(day > 0.85 && night < 0.3);
});
test("อากาศสุ่มได้หลากหลายและสอดคล้องกับ biome (หิมะเฉพาะที่หนาว)", () => {
  const w = new Weather(world, biomes, 20260925);
  const seen = new Set();
  const snowBiome = { temperature: -5, humidity: 0.5 };
  let snowCount = 0;
  for (let i = 0; i < 400; i++) {
    w.timeLeft = 0;
    w.update(1, { biome: "snow", hour: 12 });
    seen.add(w.current.id);
    if (w.current.id === "snow") snowCount++;
    void snowBiome;
  }
  assert.ok(seen.size >= 4, "อากาศหลากหลายน้อยเกิน: " + [...seen].join(","));
  assert.ok(snowCount > 0, "ไม่เคยเกิดหิมะใน biome หิมะ");
  const w2 = new Weather(world, biomes, 5);
  let desertSnow = 0;
  for (let i = 0; i < 300; i++) { w2.timeLeft = 0; w2.update(1, { biome: "desert", hour: 12 }); if (w2.current.id === "snow") desertSnow++; }
  assert.ok(desertSnow === 0, "ทะเลทรายมีหิมะตก " + desertSnow + " ครั้ง (ผิดกฎโลก)");
});

section("SAVE / LOAD (Spec ข้อ 35)");
test("serialize→load กลับมาได้ค่าเดิม (ผู้เล่น/เวลา/อากาศ)", () => {
  const t = new GameTime(world); t.hour = 13.25; t.day = 4;
  const s = t.serialize();
  const t2 = new GameTime(world); t2.load(s);
  assert.equal(t2.day, 4); assert.ok(Math.abs(t2.hour - 13.25) < 1e-6);

  const p = new Player(12.5, -7.25);
  p.stats.hp = 42; p.stats.hunger = 61;
  const p2 = new Player(0, 0); p2.load(p.serialize());
  assert.equal(p2.x, 12.5); assert.equal(p2.stats.hp, 42); assert.equal(p2.stats.hunger, 61);

  const w = new Weather(world, biomes, 9);
  const w2 = new Weather(world, biomes, 9);
  w2.load(w.serialize());
  assert.equal(w2.current.id, w.current.id);
});
test("Noise/hash เสถียร (ใช้ regenerate โลกเดิมได้)", () => {
  const n1 = new Noise(500), n2 = new Noise(500);
  for (let i = 0; i < 200; i++) {
    const x = (i - 100) * 3.7, y = i * 2.13;
    assert.equal(n1.fbm(x, y, world.terrainNoise.elevation), n2.fbm(x, y, world.terrainNoise.elevation));
    assert.equal(hash2(i, -i, 7), hash2(i, -i, 7));
  }
});

section("RESULT");
console.log("\n" + (fail === 0 ? "✅ ผ่านทั้งหมด" : "❌ มีข้อผิดพลาด") + " — ผ่าน " + pass + " / ล้มเหลว " + fail + "\n");
process.exit(fail === 0 ? 0 : 1);
