# godot/scripts/ChunkManager.gd
# CHUNK STREAMING ฝั่ง Godot (Spec ข้อ 6, 42) — โหลด/ทิ้ง chunk รอบผู้เล่น ตามงบเวลาต่อเฟรม
class_name SCChunkManager
extends Node2D

signal chunk_loaded(cx: int, cy: int)

var gen: SCWorldGen
var cfg: Dictionary
var chunks: Dictionary = {}          # "cx,cy" -> Dictionary จาก generate_chunk
var queue: Array = []
var stats := {"loaded": 0, "generated": 0, "unloaded": 0, "queued": 0}

var load_radius: int = 4
var keep_radius: int = 6
var budget_ms: float = 4.0

# พูลของ TileMapLayer + Node2D สำหรับ props (ใช้ของ Engine ไม่สร้าง renderer เอง)
var tile_layers: Dictionary = {}     # "cx,cy" -> TileMapLayer
var prop_nodes: Dictionary = {}      # "cx,cy" -> Node2D

var use_layers: bool = true
var last_center := Vector2i(9999, 9999)

func setup(world_gen: SCWorldGen, world_cfg: Dictionary) -> void:
	gen = world_gen
	cfg = world_cfg
	load_radius = int(cfg["world"].get("loadRadius", 4))
	keep_radius = int(cfg["world"].get("keepRadius", 6))

func key(cx: int, cy: int) -> String:
	return "%d,%d" % [cx, cy]

func get_chunk(cx: int, cy: int) -> Dictionary:
	return chunks.get(key(cx, cy), {})

func update_streaming(px: float, py: float) -> void:
	var s := gen.size
	var ccx := int(floor(px / float(s)))
	var ccy := int(floor(py / float(s)))
	if Vector2i(ccx, ccy) != last_center:
		last_center = Vector2i(ccx, ccy)
		queue.clear()
		for dy in range(-load_radius, load_radius + 1):
			for dx in range(-load_radius, load_radius + 1):
				if dx * dx + dy * dy > (load_radius + 0.5) * (load_radius + 0.5):
					continue
				var cx := ccx + dx
				var cy := ccy + dy
				if chunks.has(key(cx, cy)):
					continue
				queue.append({"cx": cx, "cy": cy, "d2": dx * dx + dy * dy})
		queue.sort_custom(func(a, b): return a["d2"] < b["d2"])
		stats["queued"] = queue.size()

	var t0 := Time.get_ticks_msec()
	while queue.size() > 0 and float(Time.get_ticks_msec() - t0) < budget_ms:
		var item: Dictionary = queue.pop_front()
		_load(item["cx"], item["cy"])
	stats["queued"] = queue.size()

	# unload chunk ที่ไกลเกิน keep radius
	var keep2 := float((keep_radius + 0.5) * (keep_radius + 0.5))
	var to_remove: Array = []
	for k in chunks.keys():
		var c: Dictionary = chunks[k]
		var dx: int = int(c["cx"]) - ccx
		var dy: int = int(c["cy"]) - ccy
		if float(dx * dx + dy * dy) > keep2:
			to_remove.append(k)
	for k in to_remove:
		_unload(k)

func _load(cx: int, cy: int) -> void:
	var chunk := gen.generate_chunk(cx, cy)
	chunks[key(cx, cy)] = chunk
	stats["generated"] += 1
	stats["loaded"] = chunks.size()
	if use_layers:
		_build_visuals(cx, cy, chunk)
	chunk_loaded.emit(cx, cy)

func _unload(k: String) -> void:
	chunks.erase(k)
	stats["loaded"] = chunks.size()
	stats["unloaded"] += 1
	if tile_layers.has(k):
		tile_layers[k].queue_free()
		tile_layers.erase(k)
	if prop_nodes.has(k):
		prop_nodes[k].queue_free()
		prop_nodes.erase(k)

# ── สร้าง "ภาพ" ของ chunk ด้วยของ Engine: TileMapLayer (ไม่เขียน renderer เอง) ──
# หมายเหตุ: TileSet/Sprite2D จะถูกผูกโดย Main.gd (phas 2 ต่อยอด) — ที่นี่สร้างโครงให้ครบเพื่อทดสอบสตรีมมิง
func _build_visuals(cx: int, cy: int, chunk: Dictionary) -> void:
	if not is_instance_valid(self.get_parent()):
		return
	var s := gen.size
	var layer := TileMapLayer.new()
	layer.name = key(cx, cy)
	layer.position = Vector2(float(chunk["ox"] * GameData.tile_size()), float(chunk["oy"] * GameData.tile_size()))
	add_child(layer)
	tile_layers[key(cx, cy)] = layer
	var prop_root := Node2D.new()
	prop_root.name = "props_" + key(cx, cy)
	add_child(prop_root)
	prop_nodes[key(cx, cy)] = prop_root
	for p in chunk["props"]:
		var n := Node2D.new()
		n.position = Vector2(float(p["x"]) * GameData.tile_size(), float(p["y"]) * GameData.tile_size())
		n.set_meta("prop_type", p["type"])
		prop_root.add_child(n)
	# เก็บ solid ไว้ให้ผู้เล่นใช้ชน (ฟิสิกส์ใช้ Engine ใน Phase 2)
	var solid_data := PackedByteArray(chunk["solid"])
	layer.set_meta("solid", solid_data)
	layer.set_meta("tiles", chunk["tiles"])

# ── queries สำหรับ movement/collision ──
func tile_id_at(tx: int, ty: int) -> String:
	var s := gen.size
	var cx := int(floor(float(tx) / float(s)))
	var cy := int(floor(float(ty) / float(s)))
	var c: Dictionary = chunks.get(key(cx, cy), {})
	if c.is_empty():
		return gen.tile_at(tx, ty)
	var lx: int = tx - cx * s
	var ly: int = ty - cy * s
	return gen.tile_from_index(int(c["tiles"][ly * s + lx]))

func is_solid_at(tx: int, ty: int) -> bool:
	var id := tile_id_at(tx, ty)
	if gen.is_tile_solid(id):
		return true
	var s := gen.size
	var cx := int(floor(float(tx) / float(s)))
	var cy := int(floor(float(ty) / float(s)))
	var c: Dictionary = chunks.get(key(cx, cy), {})
	if c.is_empty():
		return false
	return int(c["solid"][(ty - cy * s) * s + (tx - cx * s)]) == 1

func speed_at(tx: int, ty: int) -> float:
	var t: Dictionary = GameData.tiles["tiles"].get(tile_id_at(tx, ty), {})
	return float(t.get("speed", 1.0))

func is_liquid_at(tx: int, ty: int) -> bool:
	var t: Dictionary = GameData.tiles["tiles"].get(tile_id_at(tx, ty), {})
	return bool(t.get("liquid", false))
