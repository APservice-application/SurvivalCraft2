#!/usr/bin/env node
// tools/test/godot.test.mjs — ทดสอบฝั่ง Godot แบบ headless
// 1) โครงการ Godot ต้อง import ได้โดยไม่มี parse error
// 2) รันซีนหลัก (Main.tscn) จำนวน N เฟรม ต้องไม่มี SCRIPT ERROR และระบบต้องทำงาน (chunk/ผู้เล่น/เวลา)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const godot = process.env.GODOT_BIN || "godot";
const projectPath = resolve(root, "godot");

if (!existsSync(godot) && godot.includes("/") === false) {
  console.log("⚠ ข้ามการทดสอบ Godot: ไม่พบไบนารี '" + godot + "' (ตั้งค่า GODOT_BIN=<path> ได้)");
  process.exit(0);
}

let pass = 0, fail = 0;
const test = (n, f) => { try { f(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.error("  ✗ " + n + "\n      " + e.message); } };
const run = (args, timeout = 300000) => {
  try {
    return { out: execFileSync(godot, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }), err: "" };
  } catch (e) {
    return { out: (e.stdout || "").toString(), err: (e.stderr || "").toString() + (e.message || "") };
  }
};

console.log("=== SurvivalCraft2 — Godot headless tests ===\n");

// 1) import project (ตรวจ parse error ของทุกสคริปต์/ซีน)
const imp = run(["--headless", "--path", projectPath, "--import"], 300000);
const parseErrors = (imp.out + imp.err).split("\n").filter((l) => /SCRIPT ERROR|Parse Error/.test(l));
test("โปรเจกต์ Godot import ได้โดยไม่มี parse error", () => {
  if (parseErrors.length) throw new Error(parseErrors.slice(0, 3).join(" | "));
});

// 2) รันซีนหลักแบบ headless 180 เฟรม แล้วดูว่ามี error ไหม + มีการพิมพ์สถานะไหม
const smokeScript = resolve(projectPath, "scripts/tests/HeadlessSmoke.gd");
const smokeCode = `# สร้างอัตโนมัติโดย tools/test/godot.test.mjs — รันซีนหลัก N เฟรมแล้วสรุปสถานะ
extends SceneTree

var _frames := 0
var _main = null

func _initialize() -> void:
	var scene = load("res://scenes/Main.tscn")
	_main = scene.instantiate()
	root.add_child(_main)

func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 150:
		var mg = _main
		print("SMOKE frames=%d" % _frames)
		if mg != null and mg.get("chunks") != null:
			print("SMOKE chunks=%d generated=%d queued=%d" % [mg.chunks.stats["loaded"], mg.chunks.stats["generated"], mg.chunks.stats["queued"]])
			print("SMOKE player=%.2f,%.2f biome=%s hp=%.0f" % [mg.player.get_tile_pos().x, mg.player.get_tile_pos().y, mg.current_biome, mg.player.hp])
			print("SMOKE time=%s light=%.2f weather=%s" % [mg.time_sys.clock_text(), mg.time_sys.light(), mg.weather.name()])
		print("SMOKE_OK")
		quit(0)
	return false
`;
writeFileSync(smokeScript, smokeCode);
const smoke = run(["--headless", "--path", projectPath, "--script", "res://scripts/tests/HeadlessSmoke.gd"], 300000);
const smokeOut = smoke.out + smoke.err;
const scriptErrors = smokeOut.split("\n").filter((l) => /SCRIPT ERROR|Parse Error|Nonexistent function/.test(l));
console.log((smokeOut.match(/SMOKE[^\n]*/g) || []).map((l) => "      " + l).join("\n"));
test("รันซีนหลัก headless 150 เฟรมโดยไม่มี error", () => {
  if (scriptErrors.length) throw new Error(scriptErrors.slice(0, 3).join(" | "));
  if (!/SMOKE_OK/.test(smokeOut)) throw new Error("ซีนหลักไม่ถึงเฟรมที่ 150 (อาจค้าง)");
});
const chunksM = smokeOut.match(/SMOKE chunks=(\d+) generated=(\d+)/);
test("chunk streaming ฝั่ง Godot ทำงาน (โหลด chunk แล้ว)", () => {
  if (!chunksM) throw new Error("ไม่พบข้อมูล chunk");
  if (Number(chunksM[1]) < 8) throw new Error("โหลด chunk แค่ " + chunksM[1]);
});
const playerM = smokeOut.match(/SMOKE player=([\d.-]+),([\d.-]+) biome=(\w+)/);
test("ผู้เล่นอยู่ในโลกและมี biome ที่ถูกต้อง", () => {
  if (!playerM) throw new Error("ไม่พบข้อมูลผู้เล่น");
  if (!(Number(playerM[1]) > -1e6)) throw new Error("ตำแหน่งผู้เล่นผิดปกติ");
});
const timeM = smokeOut.match(/SMOKE time=(\d\d:\d\d) light=([\d.]+)/);
test("ระบบเวลา/แสงทำงานฝั่ง Godot", () => {
  if (!timeM) throw new Error("ไม่พบข้อมูลเวลา");
  if (Number(timeM[2]) < 0 || Number(timeM[2]) > 1) throw new Error("ค่าแสงนอกช่วง: " + timeM[2]);
});
unlinkSync(smokeScript);

console.log("\n" + (fail === 0 ? "✅ Godot tests ผ่านทั้งหมด" : "❌ Godot tests มีข้อผิดพลาด") + " — ผ่าน " + pass + " / ล้มเหลว " + fail + "\n");
process.exit(fail === 0 ? 0 : 1);
