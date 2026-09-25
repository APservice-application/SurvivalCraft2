// web/src/core/data.js — DATA LOADER (Spec ข้อ 36: Data-driven)
// ข้อมูลทั้งหมดอยู่ใน shared/data/*.json ซึ่งเป็นชุดเดียวกับที่ฝั่ง Godot ใช้ (dual-frontend)
import tiles from "../../../shared/data/tiles.json";
import biomes from "../../../shared/data/biomes.json";
import world from "../../../shared/data/world.json";
import items from "../../../shared/data/items.json";
import recipes from "../../../shared/data/recipes.json";

export const GAME_DATA = {
  tiles,
  biomes,
  world,
  items,
  recipes,
  /** ไอเทมเริ่มต้น (ชั่วคราวเพื่อทดสอบ UI — PHASE 4 จะย้ายไประบบ inventory เต็มรูปแบบ) */
  starterItems: [
    { id: "wood", name: items.items.wood.name, icon: "🪵", count: 24 },
    { id: "stone", name: items.items.stone.name, icon: "🪨", count: 12 },
    { id: "fiber", name: items.items.fiber.name, icon: "🌾", count: 8 },
    { id: "wooden_axe", name: items.items.wooden_axe.name, icon: "🪓", count: 1 },
    { id: "wooden_pickaxe", name: items.items.wooden_pickaxe.name, icon: "⛏", count: 1 },
    { id: "berry", name: items.items.berry.name, icon: "🍒", count: 6 },
    { id: "water_flask", name: items.items.water_flask.name, icon: "🧴", count: 2 },
    { id: "wheat_seed", name: items.items.wheat_seed.name, icon: "🌱", count: 10 },
  ],
};

export function validateData(d) {
  const issues = [];
  if (!d.tiles?.tiles?.grass) issues.push("tiles.json: ไม่พบ tile 'grass'");
  if (!d.biomes?.biomes?.grassland) issues.push("biomes.json: ไม่พบ biome 'grassland'");
  if (!d.world?.world?.chunkSize) issues.push("world.json: ไม่พบ chunkSize");
  const order = d.world?.world ? null : null;
  void order;
  // ตรวจว่า biome อ้าง tile/prop ที่มีจริง
  for (const [bid, b] of Object.entries(d.biomes.biomes)) {
    for (const t of Object.keys(b.terrain || {})) if (!d.tiles.tiles[t]) issues.push(`biome ${bid}: terrain '${t}' ไม่มีใน tiles.json`);
    for (const p of [...Object.keys(b.vegetation || {}), ...Object.keys(b.decoration || {})]) {
      if (!d.tiles.props[p]) issues.push(`biome ${bid}: prop '${p}' ไม่มีใน tiles.json`);
    }
  }
  // ตรวจสูตรคราฟต์
  for (const r of d.recipes.recipes) {
    if (!d.items.items[r.out.item]) issues.push(`recipe ${r.id}: ของออก '${r.out.item}' ไม่มีใน items.json`);
    for (const i of r.in) if (!d.items.items[i.item]) issues.push(`recipe ${r.id}: วัตถุดิบ '${i.item}' ไม่มีใน items.json`);
  }
  return issues;
}
