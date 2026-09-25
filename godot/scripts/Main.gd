# godot/scripts/Main.gd
# จุดประกอบเกม (composition root) — สร้างระบบทั้งหมดต่อกัน แล้วเดินเกม
# หมายเหตุสถานะ: PHASE 1 (โครงราก) — โลก/biome/chunk/time/weather/player/mobile controls ทำงานจริง
# ส่วน UI (HUD) และ Save/Load ฝั่ง Godot จะตามมาใน Phase 4/17 (ฝั่งเว็บมีแล้ว)
extends Node2D

var gen: SCWorldGen
var chunks: SCChunkManager
var player
var time_sys: SCGameTime
var weather: SCWeather
var controls: CanvasLayer
var seed_value: int = 20260925
var play_seconds: float = 0.0
var current_biome: String = "grassland"

var debug_label: Label

func _ready() -> void:
	if not GameData.loaded:
		push_error("โหลดข้อมูลเกมไม่สำเร็จ — รัน `node tools/sync-data.mjs` เพื่อคัดลอก shared/data → godot/data")
		return
	seed_value = int(GameData.world["world"].get("defaultSeed", 20260925))
	new_world(seed_value)
	_build_ui()
	set_process(true)

func new_world(world_seed: int) -> void:
	seed_value = world_seed
	gen = SCWorldGen.new(GameData.world, GameData.tiles, GameData.biomes, world_seed)
	# ล้างของเดิม (ถ้ามี) — ใช้ queue_free เพื่อไม่ให้ค้างหน่วยความจำ (Spec ข้อ 42)
	for child in get_children():
		if child is Node2D and child.name != "Camera2D":
			child.queue_free()
	chunks = SCChunkManager.new()
	chunks.name = "ChunkManager"
	add_child(chunks)
	chunks.setup(gen, GameData.world)
	# พอร์ต streaming จะถูกเรียกจาก _process ตามตำแหน่งผู้เล่น

	time_sys = SCGameTime.new(GameData.world)
	weather = SCWeather.new(GameData.world, GameData.biomes, world_seed)

	var spawn := gen.find_spawn(0, 0)
	player = preload("res://scripts/PlayerActor.gd").new()
	player.name = "Player"
	add_child(player)
	player.setup(chunks, Vector2(float(spawn["x"]), float(spawn["y"])))
	current_biome = str(spawn["biome"])

	var cam := Camera2D.new()
	cam.name = "Camera2D"
	cam.zoom = Vector2(1.6, 1.6)          # ปรับให้เห็นพื้นที่พอ ๆ กับฝั่งเว็บ
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 6.0
	add_child(cam)
	cam.make_current()
	player.add_child(cam)
	cam.position = Vector2.ZERO

	# โหลด chunk รอบจุดเกิดทันที เพื่อไม่ให้เริ่มด้วยจอว่าง
	for _i in range(30):
		chunks.update_streaming(player.position.x / float(GameData.tile_size()), player.position.y / float(GameData.tile_size()))

func _build_ui() -> void:
	controls = preload("res://scripts/MobileControls.gd").new()
	controls.name = "MobileControls"
	add_child(controls)
	controls.dodge_pressed.connect(_on_dodge)
	var hover := CanvasLayer.new()
	hover.layer = 5
	add_child(hover)
	debug_label = Label.new()
	debug_label.position = Vector2(12, 12)
	debug_label.add_theme_font_size_override("font_size", 14)
	debug_label.add_theme_color_override("font_color", Color(0.85, 1, 0.88))
	hover.add_child(debug_label)

func _on_dodge() -> void:
	var axis: Vector2 = controls.joy_axis
	if axis.length() < 0.08:
		axis = controls.keyboard_axis()
	player.try_dodge(axis)

func _process(dt: float) -> void:
	play_seconds += dt
	if player == null or chunks == null:
		return

	# 1) อินพุต
	var axis: Vector2 = controls.joy_axis
	if axis.length() < 0.08:
		axis = controls.keyboard_axis()
	player.joy_axis = axis
	player.sprint_held = controls.sprint_on or Input.is_key_pressed(KEY_SHIFT)

	# 2) เวลา + อากาศ + chunk streaming (รอบกล้อง = รอบผู้เล่น)
	time_sys.update(dt)
	var tile_px := float(GameData.tile_size())
	var tp: Vector2 = player.position / tile_px
	chunks.update_streaming(tp.x, tp.y)
	var biome_now := gen.biome_at(int(floor(tp.x)), int(floor(tp.y)))
	current_biome = biome_now
	weather.update(dt, {"biome": biome_now, "hour": time_sys.hour, "day": time_sys.day})

	# 3) survival stats (Spec ข้อ 11)
	var biome_temp := float(GameData.biomes["biomes"].get(biome_now, {}).get("temperature", 22.0)) + weather.temp_delta()
	player.update_survival(dt, {
		"moving": player.velocity.length() > 0.05,
		"sprinting": player.sprint_held and player.velocity.length() > 0.05,
		"in_water": chunks.is_liquid_at(int(floor(tp.x)), int(floor(tp.y))),
		"night": time_sys.is_night(),
		"biome_temp": biome_temp,
		"rain": weather.is_rain(),
		"near_fire": false,
	})

	_update_debug()

func _update_debug() -> void:
	if debug_label == null:
		return
	debug_label.text = "SurvivalCraft2 (Godot) • seed %d\n%s • %s • แสง %.2f\nbiome %s • อุณหภูมิร่างกาย %.1f°C\nHP %.0f อาหาร %.0f น้ำ %.0f สตามินา %.0f\nchunk %d (คิว %d) • tile %d px" % [
		seed_value, time_sys.clock_text(), weather.name(), time_sys.light(),
		current_biome, player.body_temp,
		player.hp, player.hunger, player.thirst, player.stamina,
		chunks.stats["loaded"], chunks.stats["queued"], GameData.tile_size(),
	]

# ── SAVE/LOAD (โครง — Phase 17 จะทำเต็มรูปแบบเหมือนฝั่งเว็บ) ──
func save_game(path: String = "user://save_slot1.json") -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	var data := {
		"version": 1,
		"seed": seed_value,
		"player": player.serialize(),
		"time": time_sys.serialize(),
		"weather": weather.serialize(),
		"playSeconds": play_seconds,
	}
	f.store_string(JSON.stringify(data, "\t"))
	f.close()
	return true

func load_game(path: String = "user://save_slot1.json") -> bool:
	if not FileAccess.file_exists(path):
		return false
	var f := FileAccess.open(path, FileAccess.READ)
	var data = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(data) != TYPE_DICTIONARY:
		return false
	new_world(int(data["seed"]))
	time_sys.load_state(data["time"])
	weather.load_state(data["weather"])
	var p: Dictionary = data["player"]
	player.position = Vector2(float(p["x"]), float(p["y"])) * float(GameData.tile_size())
	player.hp = float(p["hp"])
	player.hunger = float(p["hunger"])
	player.thirst = float(p["thirst"])
	player.stamina = float(p["stamina"])
	player.body_temp = float(p["temperature"])
	player.wetness = float(p["wetness"])
	player.effects = p["effects"]
	play_seconds = float(data.get("playSeconds", 0.0))
	return true
