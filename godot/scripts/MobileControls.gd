# godot/scripts/MobileControls.gd
# MOBILE CONTROL (Spec ข้อ 32) — จอยสติ๊กลอยครึ่งซ้าย + ปุ่มฝั่งขวา (ใช้ TouchScreenButton/Control ของ Engine)
# ไม่วาด UI เองด้วย renderer: ใช้ Control/TouchScreenButton ของ Godot ตามหลัก "ใช้ของ Engine ก่อน"
extends CanvasLayer

signal dodge_pressed
signal interact_pressed
signal attack_pressed
signal sprint_toggled(on: bool)
signal cast_pressed
signal inventory_pressed
signal map_pressed
signal pause_pressed

var joy_axis: Vector2 = Vector2.ZERO
var sprint_on: bool = false
var active_touch_id: int = -1
var joy_origin: Vector2 = Vector2.ZERO
const JOY_RADIUS := 66.0

var _joy_base: Panel
var _joy_knob: Panel
var _buttons: Dictionary = {}

func _ready() -> void:
	layer = 20
	_build()
	set_process_input(true)

func _panel(color: Color, size: float, radius: float = 999.0) -> Panel:
	var p := Panel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(int(radius))
	sb.border_color = Color(1, 1, 1, 0.25)
	sb.set_border_width_all(2)
	p.add_theme_stylebox_override("panel", sb)
	p.custom_minimum_size = Vector2(size, size)
	p.size = Vector2(size, size)
	return p

func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_joy_base = _panel(Color(1, 1, 1, 0.10), JOY_RADIUS * 2.0)
	_joy_base.visible = false
	root.add_child(_joy_base)
	_joy_knob = _panel(Color(0.55, 0.86, 0.66, 0.55), 54.0)
	_joy_base.add_child(_joy_knob)
	_joy_knob.position = Vector2(JOY_RADIUS - 27.0, JOY_RADIUS - 27.0)

	# ปุ่มฝั่งขวา (ตำแหน่งคำนวณจากขนาดจอจริง)
	var vp := get_viewport().get_visible_rect().size
	var actions := [
		{"id": "attack", "label": "โจมตี", "color": Color(0.85, 0.4, 0.35, 0.75), "size": 78.0, "offset": Vector2(-96.0, -120.0)},
		{"id": "interact", "label": "ใช้", "color": Color(0.4, 0.7, 0.85, 0.7), "size": 64.0, "offset": Vector2(-178.0, -108.0)},
		{"id": "dodge", "label": "หลบ", "color": Color(0.65, 0.6, 0.9, 0.7), "size": 64.0, "offset": Vector2(-96.0, -204.0)},
		{"id": "sprint", "label": "วิ่ง", "color": Color(0.4, 0.8, 0.5, 0.7), "size": 64.0, "offset": Vector2(-178.0, -192.0)},
		{"id": "cast", "label": "เวท", "color": Color(0.6, 0.45, 0.95, 0.7), "size": 58.0, "offset": Vector2(-178.0, -274.0)},
	]
	for a in actions:
		var size: float = a["size"]
		var btn := Button.new()
		btn.text = str(a["label"])
		btn.custom_minimum_size = Vector2(size, size)
		btn.size = Vector2(size, size)
		btn.add_theme_stylebox_override("normal", _style(Color(a["color"]), size))
		btn.add_theme_stylebox_override("pressed", _style(Color(a["color"]).lightened(0.25), size))
		btn.add_theme_font_size_override("font_size", 15)
		btn.position = vp + Vector2(a["offset"])
		btn.button_down.connect(_on_action.bind(str(a["id"]), true))
		btn.button_up.connect(_on_action.bind(str(a["id"]), false))
		_buttons[str(a["id"])] = btn
		root.add_child(btn)

func _style(color: Color, size: float) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(int(size / 2.0))
	sb.border_color = Color(1, 1, 1, 0.28)
	sb.set_border_width_all(2)
	return sb

func _on_action(id: String, pressed: bool) -> void:
	match id:
		"attack":
			if pressed: attack_pressed.emit()
		"interact":
			if pressed: interact_pressed.emit()
		"dodge":
			if pressed: dodge_pressed.emit()
		"cast":
			if pressed: cast_pressed.emit()
		"sprint":
			if pressed:
				sprint_on = not sprint_on
				_buttons["sprint"].modulate = Color(1.35, 1.35, 1.0) if sprint_on else Color.WHITE
				sprint_toggled.emit(sprint_on)

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var half := get_viewport().get_visible_rect().size.x * 0.5
		if event.pressed and event.position.x < half and active_touch_id == -1:
			active_touch_id = event.index
			joy_origin = event.position
			_joy_base.visible = true
			_joy_base.global_position = joy_origin - Vector2(JOY_RADIUS, JOY_RADIUS)
		elif not event.pressed and event.index == active_touch_id:
			active_touch_id = -1
			joy_axis = Vector2.ZERO
			_joy_base.visible = false
			_joy_knob.position = Vector2(JOY_RADIUS - 27.0, JOY_RADIUS - 27.0)
	elif event is InputEventScreenDrag and event.index == active_touch_id:
		var delta: Vector2 = event.position - joy_origin
		if delta.length() > JOY_RADIUS:
			delta = delta.normalized() * JOY_RADIUS
		joy_axis = delta / JOY_RADIUS
		_joy_knob.position = Vector2(JOY_RADIUS - 27.0, JOY_RADIUS - 27.0) + delta
	# เกมอย่างเดียว: รองรับคีย์บอร์ดไว้เทสต์บนเดสก์ท็อป
	elif event is InputEventKey and event.pressed:
		match (event as InputEventKey).keycode:
			KEY_SPACE: dodge_pressed.emit()
			KEY_F: interact_pressed.emit()
			KEY_Q: attack_pressed.emit()
			KEY_G: cast_pressed.emit()
			KEY_TAB: inventory_pressed.emit()
			KEY_M: map_pressed.emit()
			KEY_ESCAPE: pause_pressed.emit()

func keyboard_axis() -> Vector2:
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): v.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): v.x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): v.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): v.y += 1.0
	return v.normalized() if v.length() > 0.0 else v
