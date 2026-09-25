# godot/scripts/tests/HeadlessDeterminism.gd
# รันด้วย: godot --headless --path godot --script res://scripts/tests/HeadlessDeterminism.gd
# ตรวจว่าโลกที่สร้างฝั่ง Godot "ตรงกับฝั่งเว็บ" สำหรับ seed เดียวกัน (Spec ข้อ 4)
extends SceneTree

# หมายเหตุ: เมื่อรันด้วย --script autoload จะยังไม่ทำงาน → โหลด GameData เอง
const GameDataScript = preload("res://scripts/GameData.gd")

func _initialize() -> void:
	var GameData = GameDataScript.new()
	GameData.reload()
	if not GameData.loaded:
		printerr("FAILED: โหลด data ไม่ได้ (ต้องมี godot/data)")
		quit(1)
		return

	var seed_value := int(GameData.world["world"].get("defaultSeed", 20260925))
	var gen := SCWorldGen.new(GameData.world, GameData.tiles, GameData.biomes, seed_value)

	print("SEED ", seed_value)
	for pair in [[0, 0], [1, 2], [-3, 4]]:
		var cx: int = pair[0]
		var cy: int = pair[1]
		var chunk := gen.generate_chunk(cx, cy)
		var tiles: PackedByteArray = chunk["tiles"]
		var h := 2166136261
		for i in range(tiles.size()):
			h = SCNoise.mul32(h ^ int(tiles[i]), 16777619)
		var props: Array = chunk["props"]
		var ph := 2166136261
		for p in props:
			ph = SCNoise.mul32(ph ^ p["type"].length(), 16777619)
			ph = SCNoise.mul32(ph ^ int(round(float(p["x"]) * 100.0)), 16777619)
		print("CHUNK %d,%d tilesHash=%d props=%d propsHash=%d biome=%s" % [cx, cy, h, props.size(), ph, chunk["biome"]])

	var spawn := gen.find_spawn(0, 0)
	print("SPAWN %.1f,%.1f %s" % [spawn["x"], spawn["y"], spawn["biome"]])
	print("OK")
	quit(0)
