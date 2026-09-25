# godot/scripts/PlayerActor.gd
# PLAYER (Spec ข้อ 10) + SURVIVAL STATS (Spec ข้อ 11) ฝั่ง Godot
# กติกาตัวเลข "ชุดเดียวกัน" กับ web/src/player/player.js — แก้ที่ไหนต้องแก้ทั้งคู่ (หรือย้ายเข้า shared/rules ใน Phase 4)
extends CharacterBody2D

const BASE_SPEED := 4.4            # tile/วินาที
const SPRINT_MULT := 1.55
const DODGE_SPEED := 9.5
const DODGE_TIME := 0.34
const DODGE_CD := 0.75
const DODGE_COST := 18.0

@export var tile_px: int = 16

var chunks: SCChunkManager
var joy_axis: Vector2 = Vector2.ZERO
var sprint_held: bool = false
var facing: int = 2
var anim_t: float = 0.0
var dodging: float = 0.0
var dodge_cd: float = 0.0
var dodge_dir: Vector2 = Vector2.RIGHT

# ── survival stats ──
var max_hp := 100.0
var hp := 100.0
var max_stamina := 100.0
var stamina := 100.0
var max_mana := 50.0
var mana := 50.0
var hunger := 100.0
var thirst := 100.0
var energy := 100.0
var body_temp := 36.5
var wetness := 0.0
var effects: Array = []            # [{id, level, time_left}]

var _sprite: Node2D

func setup(chunk_manager: SCChunkManager, start_pos_tiles: Vector2) -> void:
	chunks = chunk_manager
	tile_px = GameData.tile_size()
	position = start_pos_tiles * float(tile_px)
	_sprite = _build_placeholder_body()
	add_child(_sprite)

# ตัวละครชั่วคราว: วาดด้วย Node2D (_draw) แทนสไปรต์ เพื่อให้ทดสอบได้โดยไม่ต้องมี asset
# (Phase 2 จะเปลี่ยนเป็น AnimatedSprite2D + TileSet จริง)
func _build_placeholder_body() -> Node2D:
	var n := Node2D.new()
	n.set_script(preload("res://scripts/PlayerVisual.gd"))
	return n

func get_tile_pos() -> Vector2:
	return position / float(tile_px)

func _physics_process(dt: float) -> void:
	var axis: Vector2 = joy_axis
	if axis.length() > 0.08:
		axis = axis.normalized()
	var moving: bool = axis.length() > 0.08

	dodge_cd = max(0.0, dodge_cd - dt)
	if dodging > 0.0:
		dodging = max(0.0, dodging - dt)
		_move_by(dodge_dir * DODGE_SPEED * dt)
		anim_t += dt * 4.0
		_update_visual()
		return

	var sprinting: bool = sprint_held and moving and stamina > 2.0
	if sprinting and moving:
		stamina = max(0.0, stamina - 22.0 * dt)
	else:
		stamina = min(max_stamina, stamina + (6.0 if moving else 14.0) * dt)

	var tile_speed: float = 1.0
	if chunks:
		tile_speed = chunks.speed_at(int(floor(position.x / tile_px)), int(floor(position.y / tile_px)))
	var speed: float = BASE_SPEED * tile_speed * (SPRINT_MULT if sprinting else 1.0)
	if stamina < 5.0:
		speed *= 0.65

	if moving:
		anim_t += dt * (11.0 if sprinting else 7.5)
		facing = _facing_from(axis)
		_move_by(axis * speed * dt)
	else:
		anim_t += dt * 1.2
		velocity = Vector2.ZERO

	_update_visual()

func try_dodge(axis: Vector2) -> bool:
	if dodge_cd > 0.0 or stamina < DODGE_COST:
		return false
	stamina -= DODGE_COST
	dodging = DODGE_TIME
	dodge_cd = DODGE_CD
	dodge_dir = axis.normalized() if axis.length() > 0.08 else Vector2.RIGHT.rotated(float(facing) * PI / 4.0)
	return true

# เดินพร้อมชนกำแพงแบบแยกแกน (เหมือนฝั่งเว็บ) — ใช้ข้อมูล solid ของ chunk manager
func _move_by(delta: Vector2) -> void:
	velocity = delta / max(get_physics_process_delta_time(), 0.0001)
	var target: Vector2 = position + delta
	var radius := 0.30 * float(tile_px)
	if not _blocked(Vector2(target.x, position.y), radius):
		position.x = target.x
	if not _blocked(Vector2(position.x, target.y), radius):
		position.y = target.y

func _blocked(p: Vector2, radius: float) -> bool:
	if chunks == null:
		return false
	var x0: int = int(floor((p.x - radius) / float(tile_px)))
	var x1: int = int(floor((p.x + radius) / float(tile_px)))
	var y0: int = int(floor((p.y - radius) / float(tile_px)))
	var y1: int = int(floor((p.y + radius) / float(tile_px)))
	for ty in range(y0, y1 + 1):
		for tx in range(x0, x1 + 1):
			var cx: float = clamp(p.x / float(tile_px), float(tx), float(tx + 1))
			var cy: float = clamp(p.y / float(tile_px), float(ty), float(ty + 1))
			var ddx: float = (p.x / float(tile_px)) - cx
			var ddy: float = (p.y / float(tile_px)) - cy
			if ddx * ddx + ddy * ddy > pow(radius / tile_px, 2.0):
				continue
			if chunks.is_solid_at(tx, ty):
				return true
	return false

func _facing_from(v: Vector2) -> int:
	var a := atan2(v.y, v.x)
	if a < 0.0:
		a += TAU
	return int(round(a / (PI / 4.0))) % 8

func _update_visual() -> void:
	if _sprite and _sprite.has_method("configure"):
		_sprite.configure(facing, anim_t, velocity.length() > 0.05, dodging > 0.0)

# ── SURVIVAL (Spec ข้อ 11) — ระบบเชื่อมโยงกันทั้งหมด ──
func update_survival(dt: float, ctx: Dictionary) -> void:
	var moving: bool = bool(ctx.get("moving", false))
	var sprinting: bool = bool(ctx.get("sprinting", false))
	hunger = clamp(hunger - 0.28 * dt * (1.15 if moving else 1.0) * (1.6 if sprinting else 1.0), 0.0, 100.0)
	thirst = clamp(thirst - 0.36 * dt * (1.15 if moving else 1.0) * (1.75 if sprinting else 1.0), 0.0, 100.0)
	energy = clamp(energy - 0.5 * dt, 0.0, 100.0)
	mana = clamp(mana + 1.4 * dt, 0.0, max_mana)

	var target: float = 36.5 + clamp((float(ctx.get("biome_temp", 22.0)) - 22.0) / 12.0, -1.6, 1.6) * 0.9
	if bool(ctx.get("night", false)):
		target -= 0.45
	if bool(ctx.get("rain", false)):
		target -= 0.35
	if wetness > 0.4:
		target -= 0.7
	if bool(ctx.get("near_fire", false)):
		target += 0.9
	body_temp = lerp(body_temp, target, clamp(0.02 * dt * 6.0, 0.0, 1.0))
	var wet_env: bool = bool(ctx.get("in_water", false)) or bool(ctx.get("rain", false))
	wetness = clamp(wetness + (0.5 * dt if bool(ctx.get("in_water", false)) else (0.12 * dt if wet_env else -0.06 * dt)), 0.0, 1.0)

	_update_effects(dt)
	if hp <= 0.0 and not bool(ctx.get("dead", false)):
		pass

func _add_effect(id: String, level: int = 1, time: float = 8.0) -> void:
	for e in effects:
		if e["id"] == id:
			return
	effects.append({"id": id, "level": level, "time_left": time})

func _update_effects(dt: float) -> void:
	var keep: Array = []
	for e in effects:
		e["time_left"] = float(e["time_left"]) - dt
		if float(e["time_left"]) > 0.0:
			keep.append(e)
	effects = keep
	if hunger <= 0.0:
		_add_effect("starving", 1, 5.0)
		hp = clamp(hp - 0.6 * dt, 0.0, max_hp)
	if thirst <= 0.0:
		_add_effect("dehydrated", 1, 5.0)
		hp = clamp(hp - 0.9 * dt, 0.0, max_hp)
	if body_temp < 35.0:
		_add_effect("hypothermia", 2 if body_temp < 34.0 else 1, 6.0)
		hp = clamp(hp - 0.35 * dt, 0.0, max_hp)
	if body_temp > 38.4:
		_add_effect("heatstroke", 1, 6.0)
		hp = clamp(hp - 0.3 * dt, 0.0, max_hp)
	if wetness > 0.6:
		_add_effect("wet", 1, 4.0)
	if hunger < 25.0:
		_add_effect("hungry", 1, 4.0)
	if thirst < 25.0:
		_add_effect("thirsty", 1, 4.0)
	if energy < 20.0:
		_add_effect("exhausted", 1, 6.0)
	if hunger > 60.0 and thirst > 60.0 and hp < max_hp:
		hp = clamp(hp + 0.25 * dt, 0.0, max_hp)

func eat(item_id: String) -> void:
	var item: Dictionary = GameData.items.get("items", {}).get(item_id, {})
	var food: Dictionary = item.get("food", {})
	if food.is_empty():
		return
	hunger = clamp(hunger + float(food.get("hunger", 0)), 0.0, 100.0)
	thirst = clamp(thirst + float(food.get("thirst", 0)), 0.0, 100.0)
	hp = clamp(hp + float(food.get("heal", 0)), 0.0, max_hp)

func serialize() -> Dictionary:
	return {
		"x": get_tile_pos().x, "y": get_tile_pos().y, "facing": facing,
		"hp": hp, "hunger": hunger, "thirst": thirst, "stamina": stamina,
		"mana": mana, "energy": energy, "temperature": body_temp, "wetness": wetness,
		"effects": effects,
	}
