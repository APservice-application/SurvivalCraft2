# godot/scripts/PlayerVisual.gd
# ตัวละครผู้เล่นแบบ procedural drawing (ยังไม่ใช้ asset) — สไตล์เดียวกับฝั่งเว็บ (docs/STYLE_GUIDE.md)
# Phase 2: เปลี่ยนเป็น AnimatedSprite2D + สไปรต์จริง โดยคงสัดส่วน/จานสีเดิม
extends Node2D

var facing: int = 2
var anim_t: float = 0.0
var moving: bool = false
var dodging: bool = false

const SKIN := Color("#f0c79a")
const HAIR := Color("#4a3226")
const SHIRT_A := Color("#5f9ea0")
const SHIRT_B := Color("#3d7a7c")
const PANTS := Color("#3b4a63")
const BELT := Color("#6b4a2b")
const EYE := Color("#22303f")

func configure(f: int, t: float, is_moving: bool, is_dodging: bool) -> void:
	facing = f
	anim_t = t
	moving = is_moving
	dodging = is_dodging
	queue_redraw()

func _draw() -> void:
	var tile := float(GameData.tile_size())
	var h := tile * 1.25            # ความสูงตัวละคร ~1.25 tile (ตรงกับฝั่งเว็บ)
	var bob := (sin(anim_t * 2.0) * h * 0.11) if moving else (sin(anim_t) * h * 0.02)
	var alpha := 0.7 if dodging else 1.0
	var flip := facing in [3, 4, 5]

	# เงา
	draw_set_transform(Vector2.ZERO)
	draw_circle(Vector2(0, 1.0), h * 0.19, Color(0, 0, 0, 0.28))

	# ขา
	var leg_swing: float = (sin(anim_t * 2.0) * h * 0.16) if moving else 0.0
	draw_rect(Rect2(-h * 0.24 + leg_swing, -h * 0.34, h * 0.18, h * 0.34), PANTS)
	draw_rect(Rect2(h * 0.06 - leg_swing, -h * 0.34, h * 0.18, h * 0.34), PANTS)

	# ลำตัว
	draw_rect(Rect2(-h * 0.32, -h * 0.9 + bob, h * 0.64, h * 0.62), Color(SHIRT_A, alpha))
	draw_rect(Rect2(-h * 0.32, -h * 0.9 + bob, h * 0.64, h * 0.2), Color(SHIRT_B, alpha))
	draw_rect(Rect2(-h * 0.32, -h * 0.44 + bob, h * 0.64, h * 0.09), BELT)

	# แขน
	draw_rect(Rect2(-h * 0.42, -h * 0.86 + bob, h * 0.12, h * 0.4), Color(SKIN, alpha))
	draw_rect(Rect2(h * 0.30, -h * 0.86 + bob, h * 0.12, h * 0.4), Color(SKIN, alpha))

	# หัว
	draw_circle(Vector2(0, -h * 1.02 + bob), h * 0.26, Color(SKIN, alpha))
	draw_arc(Vector2(0, -h * 1.06 + bob), h * 0.27, PI * 1.05, PI * 1.95, 16, Color(HAIR, alpha), h * 0.12)

	# ตา (หันตามทิศ)
	var eye_off := h * 0.09 * (-1.0 if flip else 1.0)
	var eye_y := -h * 1.0 + bob
	draw_rect(Rect2(eye_off - h * 0.09, eye_y, h * 0.06, h * 0.07), EYE)
	draw_rect(Rect2(eye_off + h * 0.04, eye_y, h * 0.06, h * 0.07), EYE)
