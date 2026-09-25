# godot/scripts/WorldGen.gd
# WORLD GENERATOR ฝั่ง Godot — พอร์ตจาก web/src/world/worldgen.js แบบ 1:1
# เป้าหมาย: seed เดียวกัน → โลกเหมือนกันทั้งสอง frontend (ทดสอบได้ด้วย tools/test/determinism.mjs)
class_name SCWorldGen
extends RefCounted

var cfg: Dictionary
var tiles_db: Dictionary
var biomes_db: Dictionary
var seed: int
var size: int
var n: Dictionary
var th: Dictionary
var temps: Dictionary
var moist: Dictionary

var n_continent: SCNoise
var n_elevation: SCNoise
var n_moisture: SCNoise
var n_temperature: SCNoise
var n_detail: SCNoise
var n_river: SCNoise
var n_cave: SCNoise
var n_cluster: SCNoise
var n_clearing: SCNoise
var n_structure: SCNoise

const TILE_ORDER := ["deep_water", "water", "sand", "grass", "lush_grass", "forest_floor", "dirt",
	"farmland", "stone", "rock", "snow", "mud", "road", "magic_ground"]

func _init(world_cfg: Dictionary, tiles_data: Dictionary, biomes_data: Dictionary, world_seed: int) -> void:
	cfg = world_cfg
	tiles_db = tiles_data
	biomes_db = biomes_data
	seed = world_seed
	size = int(cfg["world"]["chunkSize"])
	n = cfg["terrainNoise"]
	th = cfg["thresholds"]
	temps = cfg["temperatures"]
	moist = cfg["moistureLevels"]
	n_continent = SCNoise.new(seed + 11)
	n_elevation = SCNoise.new(seed + 23)
	n_moisture = SCNoise.new(seed + 37)
	n_temperature = SCNoise.new(seed + 53)
	n_detail = SCNoise.new(seed + 71)
	n_river = SCNoise.new(seed + 97)
	n_cave = SCNoise.new(seed + 131)
	n_cluster = SCNoise.new(seed + 173)
	n_clearing = SCNoise.new(seed + 211)
	n_structure = SCNoise.new(seed + 251)

# ── terrain fields ──
func continent_at(x: float, y: float) -> float:
	return n_continent.fbm(x, y, n["continent"])

func elevation_at(x: float, y: float) -> float:
	var e := n_elevation.fbm(x, y, n["elevation"])
	var c := continent_at(x, y)
	var cw: float = SCNoise.clamp01((c - float(th["water"])) / 0.25)
	return SCNoise.clamp01(e * 0.55 + cw * 0.55 - 0.05)

func moisture_at(x: float, y: float) -> float:
	return n_moisture.fbm(x, y, n["moisture"])

func temperature_at(x: float, y: float) -> float:
	return n_temperature.fbm(x, y, n["temperature"])

func river_at(x: float, y: float) -> float:
	return n_river.ridged(x, y, {"scale": 0.004, "octaves": 3, "persistence": 0.5, "lacunarity": 2, "offsetX": 12000, "offsetY": 3400})

func height_at(x: float, y: float) -> float:
	return SCNoise.clamp01(continent_at(x, y) * 0.72 + elevation_at(x, y) * 0.28)

# ── biome ──
func biome_at(x: int, y: int) -> String:
	var c := continent_at(float(x), float(y))
	if c < float(th["deepWater"]):
		return "deep_ocean"
	if c < float(th["water"]):
		return "ocean"
	if c < float(th["beach"]):
		return "beach"
	var e := elevation_at(float(x), float(y))
	var m := moisture_at(float(x), float(y))
	var t := temperature_at(float(x), float(y))
	var h := height_at(float(x), float(y))
	var rv := river_at(float(x), float(y))
	if rv > 0.955 and h > 0.33 and h < float(th["snow"]):
		return "river"
	if h > float(th["snow"]):
		return "snow"
	if h > float(th["mountain"]):
		return "snow" if m > 0.6 else "mountain"
	var magic := SCNoise.hash3(int(floor(float(x) / 8.0)), int(floor(float(y) / 8.0)), 7, seed)
	if magic > 0.992 and m > 0.45 and t > float(temps["polarBelow"]):
		return "magical_area"
	var ruin := n_structure.fbm(float(x), float(y), n["detail"])
	if ruin > 0.82 and m > 0.25 and m < 0.7:
		return "ruins"
	var hot := t > float(temps["hotAbove"])
	var cold := t < float(temps["coldBelow"])
	var polar := t < float(temps["polarBelow"])
	var wet := m > float(moist["wetBelow"])
	var dry := m < float(moist["aridBelow"])
	if polar:
		return "snow" if wet else "mountain"
	if cold:
		return "forest" if wet else "plains"
	if hot and dry:
		return "desert"
	if hot:
		return "deep_forest" if wet else "plains"
	if dry:
		return "desert" if m < float(moist["dryBelow"]) else "plains"
	if wet:
		return "swamp"
	if m > float(moist["normalBelow"]):
		return "deep_forest"
	return "forest" if m >= float(moist["aridBelow"]) else "grassland"

# ── tiles ──
func tile_at(x: int, y: int) -> String:
	var biome := biome_at(x, y)
	var def: Dictionary = biomes_db["biomes"][biome]
	var pick := SCNoise.hash2(x, y, seed + 9001)
	var acc := 0.0
	var chosen := "grass"
	for tile_id in def["terrain"].keys():
		acc += float(def["terrain"][tile_id])
		if pick <= acc:
			chosen = tile_id
			break
		chosen = tile_id
	if chosen in ["grass", "forest_floor", "lush_grass"]:
		var p := n_structure.fbm(float(x), float(y), {"scale": 0.012, "octaves": 2, "persistence": 0.5, "lacunarity": 2, "offsetX": 5000, "offsetY": 8000})
		if p > 0.735 and p < 0.752:
			return "road"
	return chosen

func tile_index(tile_id: String) -> int:
	return TILE_ORDER.find(tile_id)

func tile_from_index(i: int) -> String:
	return TILE_ORDER[i] if i >= 0 and i < TILE_ORDER.size() else "grass"

func is_tile_solid(tile_id: String) -> bool:
	var t: Dictionary = tiles_db["tiles"].get(tile_id, {})
	return bool(t.get("solid", false))

# ── chunk generation (deterministic เหมือนฝั่งเว็บ) ──
func generate_chunk(cx: int, cy: int) -> Dictionary:
	var s := size
	var ox := cx * s
	var oy := cy * s
	var tiles := PackedByteArray()
	tiles.resize(s * s)
	var solid := PackedByteArray()
	solid.resize(s * s)
	var props: Array = []
	var prop_grid := PackedByteArray()
	prop_grid.resize(s * s)
	prop_grid.fill(255)
	var cr: Dictionary = cfg["decorRules"]
	var biome_counts := {}

	for y in range(s):
		for x in range(s):
			var wx := ox + x
			var wy := oy + y
			var tile_id := tile_at(wx, wy)
			var idx := tile_index(tile_id)
			tiles[y * s + x] = idx if idx >= 0 else 3
			if is_tile_solid(tile_id):
				solid[y * s + x] = 1
			var bn := biome_at(wx, wy)
			biome_counts[bn] = int(biome_counts.get(bn, 0)) + 1

	var main_biome := "grassland"
	var best := -1
	for bn in biome_counts.keys():
		if int(biome_counts[bn]) > best:
			best = int(biome_counts[bn])
			main_biome = bn

	var cluster_cfg: Dictionary = cr["forestCluster"]
	var clearing_cfg: Dictionary = cr["clearings"]
	for y in range(s):
		for x in range(s):
			var wx := ox + x
			var wy := oy + y
			var tile_id := tile_from_index(tiles[y * s + x])
			var tdef: Dictionary = tiles_db["tiles"].get(tile_id, {})
			if bool(tdef.get("liquid", false)):
				continue
			var biome := biome_at(wx, wy)
			var bdef: Dictionary = biomes_db["biomes"][biome]
			if _near_liquid(wx, wy, 1) and bool(cr.get("edgeAvoidLiquid", true)):
				continue
			var cluster_mul := 1.0
			if bool(cr.get("clusterTrees", true)):
				var cf := n_cluster.value(float(wx) * float(cluster_cfg["scale"]), float(wy) * float(cluster_cfg["scale"]))
				if cf > float(cluster_cfg["threshold"]):
					cluster_mul = float(cluster_cfg["bonus"])
				var cl := n_clearing.value(float(wx) * float(clearing_cfg["scale"]), float(wy) * float(clearing_cfg["scale"]))
				if cl > float(clearing_cfg["threshold"]):
					cluster_mul *= float(clearing_cfg["multiplier"])

			var placed := false
			for prop_id in bdef.get("vegetation", {}).keys():
				var density: float = float(bdef["vegetation"][prop_id]) * cluster_mul * float(cr.get("densityScale", 1.0))
				if density <= 0.0:
					continue
				if SCNoise.hash2(wx, wy, seed + prop_id.length() * 7717) < density and not _prop_nearby(prop_grid, s, x, y):
					var pdef: Dictionary = tiles_db["props"][prop_id]
					var px := float(wx) + 0.5 + (SCNoise.hash2(wx, wy, 5) - 0.5) * 0.5
					var py := float(wy) + 0.5 + (SCNoise.hash2(wx, wy, 6) - 0.5) * 0.5
					props.append({
						"type": prop_id, "tx": wx, "ty": wy, "x": px, "y": py,
						"s": 1.0 + (SCNoise.hash2(wx, wy, 7) - 0.5) * 0.18,
						"flip": SCNoise.hash2(wx, wy, 9) > 0.5,
						"v": int(SCNoise.hash2(wx, wy, 11) * 1000.0),
					})
					prop_grid[y * s + x] = props.size() - 1
					if bool(pdef.get("solid", false)):
						solid[y * s + x] = 1
					placed = true
					break
			if placed:
				continue
			for prop_id in bdef.get("decoration", {}).keys():
				var density: float = float(bdef["decoration"][prop_id]) * float(cr.get("densityScale", 1.0))
				if density <= 0.0:
					continue
				if SCNoise.hash2(wx, wy, seed + prop_id.length() * 4201) < density:
					props.append({
						"type": prop_id, "tx": wx, "ty": wy,
						"x": float(wx) + 0.5 + (SCNoise.hash2(wx, wy, 21) - 0.5) * 0.8,
						"y": float(wy) + 0.5 + (SCNoise.hash2(wx, wy, 22) - 0.5) * 0.8,
						"s": 0.85 + SCNoise.hash2(wx, wy, 23) * 0.3,
						"flip": SCNoise.hash2(wx, wy, 24) > 0.5,
						"v": int(SCNoise.hash2(wx, wy, 25) * 1000.0),
					})
					prop_grid[y * s + x] = props.size() - 1
					break

	return {"cx": cx, "cy": cy, "ox": ox, "oy": oy, "tiles": tiles, "solid": solid, "props": props, "biome": main_biome, "biomeCounts": biome_counts}

func _prop_nearby(prop_grid: PackedByteArray, s: int, x: int, y: int) -> bool:
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var nx := x + dx
			var ny := y + dy
			if nx < 0 or ny < 0 or nx >= s or ny >= s:
				continue
			if prop_grid[ny * s + nx] != 255:
				return true
	return false

func _near_liquid(wx: int, wy: int, radius: int) -> bool:
	for dy in range(-radius, radius + 1):
		for dx in range(-radius, radius + 1):
			if dx == 0 and dy == 0:
				continue
			var b := biome_at(wx + dx, wy + dy)
			if b in ["ocean", "deep_ocean", "river", "lake"]:
				return true
	return false

# ── helper: ตรวจว่าพื้นที่รอบจุดหนึ่งไม่มี prop ทึบ (ใช้หาจุดเกิด) ──
func area_clear_of_props(x: float, y: float, radius: float = 1.35) -> bool:
	var cx := int(floor(x / float(size)))
	var cy := int(floor(y / float(size)))
	var seen := {}
	for dy in range(-1, 2):
		for dx in range(-1, 2):
			var key := "%d,%d" % [cx + dx, cy + dy]
			if seen.has(key):
				continue
			seen[key] = true
			var ch := generate_chunk(cx + dx, cy + dy)
			for p in ch["props"]:
				var pdef: Dictionary = tiles_db["props"].get(p["type"], {})
				if not bool(pdef.get("solid", false)):
					continue
				var rr: float = radius + float(pdef.get("radius", 0.45))
				var ddx: float = float(p["x"]) - x
				var ddy: float = float(p["y"]) - y
				if ddx * ddx + ddy * ddy < rr * rr:
					return false
	return true

func find_spawn(start_x: int = 0, start_y: int = 0, max_ring: int = 220) -> Dictionary:
	for ring in range(max_ring):
		var count: int = 1 if ring == 0 else ring * 8
		for i in range(count):
			var a := (float(i) / float(count)) * TAU
			var x := int(round(float(start_x) + cos(a) * float(ring) * 2.0))
			var y := int(round(float(start_y) + sin(a) * float(ring) * 2.0))
			var b := biome_at(x, y)
			if b in ["ocean", "deep_ocean", "river", "lake", "mountain", "snow", "swamp", "cave"]:
				continue
			var h := height_at(float(x), float(y))
			if h <= float(th["water"]) or h >= 0.55:
				continue
			if is_tile_solid(tile_at(x, y)):
				continue
			if not area_clear_of_props(float(x) + 0.5, float(y) + 0.5, 1.4):
				continue
			return {"x": float(x) + 0.5, "y": float(y) + 0.5, "biome": b}
	return {"x": float(start_x) + 0.5, "y": float(start_y) + 0.5, "biome": "grassland"}
