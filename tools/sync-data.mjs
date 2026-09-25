#!/usr/bin/env node
// tools/sync-data.mjs — คัดลอก shared/data/*.json → godot/data/*.json
// เพื่อให้ทั้งสอง frontend (Web และ Godot) ใช้ "ข้อมูลชุดเดียวกัน" (Godot อ่านไฟล์นอก res:// ไม่ได้)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "shared/data");
const dst = resolve(root, "godot/data");
mkdirSync(dst, { recursive: true });

let n = 0, changed = 0;
for (const f of readdirSync(src).filter((f) => f.endsWith(".json"))) {
  const text = readFileSync(resolve(src, f), "utf8");
  const out = resolve(dst, f);
  let same = false;
  try { same = readFileSync(out, "utf8") === text; } catch (e) { same = false; }
  if (!same) { writeFileSync(out, text); changed++; }
  n++;
  console.log((same ? "  = " : "  ✔ ") + "godot/data/" + f + (same ? " (ไม่เปลี่ยน)" : ""));
}
console.log(changed === 0 ? `ไม่มีไฟล์เปลี่ยน (${n} ไฟล์ตรงกันแล้ว)` : `ซิงก์ ${changed}/${n} ไฟล์`);
