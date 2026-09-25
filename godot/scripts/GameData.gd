# godot/scripts/GameData.gd — autoload
# โหลดข้อมูลเกมจาก "ไฟล์ชุดเดียวกับฝั่งเว็บ" (godot/data/*.json ← คัดลอกจาก shared/data/)
# Spec ข้อ 36: Data-driven — เพิ่ม content ได้โดยไม่แก้โค้ด
extends Node

const DATA_DIR := "res://data/"

var tiles: Dictionary = {}
var biomes: Dictionary = {}
var world: Dictionary = {}
var items: Dictionary = {}
var recipes: Dictionary = {}
var loaded: bool = false
var issues: Array[String] = []

func _ready() -> void:
	reload()

func reload() -> void:
	issues.clear()
	tiles = _load_json("tiles.json")
	biomes = _load_json("biomes.json")
	world = _load_json("world.json")
	items = _load_json("items.json")
	recipes = _load_json("recipes.json")
	loaded = world.has("world") and tiles.has("tiles") and biomes.has("biomes")
	if not loaded:
		issues.append("โหลดข้อมูลไม่ครบ — ตรวจว่ามีโฟลเดอร์ godot/data (รัน `node tools/sync-data.mjs`)")
	_validate()
	for i in issues:
		push_warning("[GameData] " + i)

func _load_json(name: String) -> Dictionary:
	var path := DATA_DIR + name
	if not FileAccess.file_exists(path):
		issues.append("ไม่พบไฟล์ " + path)
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	var text := f.get_as_text()
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		issues.append("อ่าน JSON ไม่ได้: " + name)
		return {}
	return parsed

func _validate() -> void:
	for bid in biomes.get("biomes", {}).keys():
		var b: Dictionary = biomes["biomes"][bid]
		for t in b.get("terrain", {}).keys():
			if not tiles.get("tiles", {}).has(t):
				issues.append("biome %s อ้าง tile '%s' ที่ไม่มีใน tiles.json" % [bid, t])
		for group in ["vegetation", "decoration"]:
			for p in b.get(group, {}).keys():
				if not tiles.get("props", {}).has(p):
					issues.append("biome %s อ้าง prop '%s' ที่ไม่มีใน tiles.json" % [bid, p])

func tile_order() -> PackedStringArray:
	# ลำดับเดียวกับ TILE_ORDER ใน web/src/world/worldgen.js (ใช้ index เก็บใน Uint8Array/PackedByteArray)
	return PackedStringArray([
		"deep_water", "water", "sand", "grass", "lush_grass", "forest_floor", "dirt",
		"farmland", "stone", "rock", "snow", "mud", "road", "magic_ground",
	])

func chunk_size() -> int:
	return int(world.get("world", {}).get("chunkSize", 32))

func tile_size() -> int:
	return int(world.get("world", {}).get("tileSize", 16))
