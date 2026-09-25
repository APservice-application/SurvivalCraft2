# godot/scripts/Weather.gd
# WEATHER SYSTEM (Spec ข้อ 13) — กติกาเดียวกับ web/src/systems/weather.js
class_name SCWeather
extends RefCounted

const DEF := {
	"clear": {"id": "clear", "name": "ท้องฟ้าแจ่มใส", "lightMul": 1.0, "moistureGain": 0.0, "tempDelta": 0.0},
	"cloudy": {"id": "cloudy", "name": "มีเมฆ", "lightMul": 0.92, "moistureGain": 0.02, "tempDelta": -0.6},
	"rain": {"id": "rain", "name": "ฝนตก", "lightMul": 0.78, "moistureGain": 0.9, "tempDelta": -1.6, "wetness": 0.12},
	"heavy_rain": {"id": "heavy_rain", "name": "ฝนหนัก", "lightMul": 0.66, "moistureGain": 1.6, "tempDelta": -2.6, "wetness": 0.28, "movePenalty": 0.92},
	"storm": {"id": "storm", "name": "พายุ", "lightMul": 0.5, "moistureGain": 2.2, "tempDelta": -3.4, "wetness": 0.4, "movePenalty": 0.86, "danger": true},
	"fog": {"id": "fog", "name": "หมอก", "lightMul": 0.72, "moistureGain": 0.3, "tempDelta": -1.0},
	"snow": {"id": "snow", "name": "หิมะตก", "lightMul": 0.85, "moistureGain": 0.4, "tempDelta": -4.0, "wetness": 0.1, "cold": true},
	"heat": {"id": "heat", "name": "อากาศร้อนจัด", "lightMul": 1.05, "moistureGain": -0.6, "tempDelta": 5.0, "thirstMul": 1.5},
	"wind": {"id": "wind", "name": "ลมแรง", "lightMul": 0.96, "moistureGain": 0.0, "tempDelta": -1.2},
}

var cfg: Dictionary
var biomes_db: Dictionary
var current: Dictionary = DEF["clear"]
var time_left: float = 120.0
var rng := RandomNumberGenerator.new()

func _init(world_cfg: Dictionary, biomes_data: Dictionary, world_seed: int) -> void:
	cfg = world_cfg["weather"]
	biomes_db = biomes_data
	rng.seed = world_seed + 77771

func update(dt: float, ctx: Dictionary) -> void:
	time_left -= dt
	if time_left <= 0.0:
		_roll(ctx)

func _roll(ctx: Dictionary) -> void:
	var biome: String = str(ctx.get("biome", "grassland"))
	var bdef: Dictionary = biomes_db.get("biomes", {}).get(biome, {})
	var hour: float = float(ctx.get("hour", 12.0))
	var humid: float = float(bdef.get("humidity", 0.5))
	var temp: float = float(bdef.get("temperature", 20.0))
	var entries: Array = []
	var total := 0.0
	for key in cfg["types"].keys():
		var w: float = float(cfg["types"][key])
		if key in ["rain", "heavy_rain", "storm"]:
			w *= 0.15 if humid < 0.2 else (2.1 if humid > 0.85 else 1.0)
		elif key == "snow":
			w = w * 5.0 if temp <= 2.0 else (w * 0.5 if temp <= 8.0 else 0.0)
		elif key == "heat":
			w = w * 3.0 if temp > 35.0 else (w * 0.6 if temp > 29.0 else 0.0)
		elif key == "fog":
			w *= 2.4 if hour >= 4.0 and hour <= 8.0 else 0.6
		entries.append([key, w])
		total += w
	var roll := rng.randf() * total
	var chosen := "clear"
	for e in entries:
		roll -= float(e[1])
		if roll <= 0.0:
			chosen = str(e[0])
			break
	current = DEF.get(chosen, DEF["clear"])
	time_left = float(cfg.get("changeEveryMinutes", 6)) * 60.0 * (0.65 + rng.randf() * 0.9)

func name() -> String:
	return str(current["name"])

func temp_delta() -> float:
	return float(current.get("tempDelta", 0.0))

func move_penalty() -> float:
	return float(current.get("movePenalty", 1.0))

func is_rain() -> bool:
	return str(current["id"]) in ["rain", "heavy_rain", "storm"]

func serialize() -> Dictionary:
	return {"id": current["id"], "timeLeft": time_left}

func load_state(s: Dictionary) -> void:
	if s.is_empty():
		return
	var id: String = str(s.get("id", "clear"))
	if DEF.has(id):
		current = DEF[id]
	time_left = float(s.get("timeLeft", 120.0))
