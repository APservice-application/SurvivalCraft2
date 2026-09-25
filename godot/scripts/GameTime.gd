# godot/scripts/GameTime.gd
# DAY / NIGHT SYSTEM (Spec ข้อ 12) — กติกาเดียวกับ web/src/systems/time.js
class_name SCGameTime
extends RefCounted

const PHASES := [
	{"id": "dawn", "name": "รุ่งอรุณ", "from": 4.5, "to": 6.5},
	{"id": "morning", "name": "เช้า", "from": 6.5, "to": 11.0},
	{"id": "noon", "name": "เที่ยง", "from": 11.0, "to": 14.0},
	{"id": "evening", "name": "บ่าย", "from": 14.0, "to": 17.5},
	{"id": "sunset", "name": "พระอาทิตย์ตก", "from": 17.5, "to": 19.0},
	{"id": "night", "name": "กลางคืน", "from": 19.0, "to": 22.0},
	{"id": "midnight", "name": "ดึก", "from": 22.0, "to": 28.0},
]

const LIGHT_KEYS := [[0.0, 0.10], [4.0, 0.10], [5.2, 0.30], [6.5, 0.72], [8.0, 0.95], [12.0, 1.0],
	[15.0, 0.98], [17.0, 0.82], [18.3, 0.55], [19.5, 0.30], [21.0, 0.14], [24.0, 0.10]]

var day_length_minutes: float = 16.0
var hour: float = 6.5
var day: int = 1
var total_days: int = 1

func _init(world_cfg: Dictionary) -> void:
	day_length_minutes = float(world_cfg["time"].get("dayLengthMinutes", 16.0))
	hour = float(world_cfg["time"].get("startHour", 6.5))

func update(dt: float) -> void:
	var hours_per_sec := 24.0 / (day_length_minutes * 60.0)
	hour += dt * hours_per_sec
	while hour >= 24.0:
		hour -= 24.0
		day += 1
		total_days += 1

func phase() -> Dictionary:
	for p in PHASES:
		if hour >= float(p["from"]) and hour < float(p["to"]):
			return p
	return PHASES[PHASES.size() - 1]

func light() -> float:
	return _sample(LIGHT_KEYS, hour)

func is_night() -> bool:
	return hour >= 19.0 or hour < 4.5

func clock_text() -> String:
	var h := int(floor(hour))
	var m := int(floor((hour - float(h)) * 60.0))
	return "%02d:%02d" % [h, m]

func _sample(keys: Array, h: float) -> float:
	var hh: float = fposmod(h, 24.0)
	for i in range(keys.size() - 1):
		var t0: float = keys[i][0]
		var v0: float = keys[i][1]
		var t1: float = keys[i + 1][0]
		var v1: float = keys[i + 1][1]
		if hh >= t0 and hh <= t1:
			var k: float = (hh - t0) / max(t1 - t0, 0.0001)
			return v0 + (v1 - v0) * k
	return 0.1

func serialize() -> Dictionary:
	return {"hour": hour, "day": day, "totalDays": total_days}

func load_state(s: Dictionary) -> void:
	if s.is_empty():
		return
	hour = float(s.get("hour", hour))
	day = int(s.get("day", 1))
	total_days = int(s.get("totalDays", day))
