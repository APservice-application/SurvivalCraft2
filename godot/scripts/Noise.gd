# godot/scripts/Noise.gd
# ภาพสะท้อน (mirror) ของ web/src/core/math.js — ต้องให้ผล "เหมือนกันเป๊ะ" เพื่อให้โลกที่สร้างจาก seed เดียวกัน
# ตรงกันทั้งสอง frontend (Spec ข้อ 4: Seed เดิมต้องให้โลกเหมือนเดิมแบบ deterministic)
#
# หมายเหตุ: JS ใช้ Math.imul (คูณ 32-bit แบบ wraparound) → ที่นี่ต้องจำลองการตัด 32-bit เอง
# เพราะ int ของ GDScript เป็น 64-bit
class_name SCNoise
extends RefCounted

const MASK32 := 0xFFFFFFFF

var seed: int = 1337

func _init(s: int = 1337) -> void:
	seed = s

# ── 32-bit integer helpers (ให้ตรงกับ Math.imul / >>> ของ JavaScript) ──
static func mul32(a: int, b: int) -> int:
	a &= MASK32
	b &= MASK32
	var a_lo := a & 0xFFFF
	var a_hi := (a >> 16) & 0xFFFF
	var b_lo := b & 0xFFFF
	var b_hi := (b >> 16) & 0xFFFF
	var t := a_lo * b_lo + (((a_hi * b_lo + a_lo * b_hi) & 0xFFFF) << 16)
	return t & MASK32

static func xor32(a: int, b: int) -> int:
	return (a ^ b) & MASK32

# h = imul(h ^ (h >>> 13), 1274126177)
static func mix32(h: int, shift: int, mult: int) -> int:
	var x: int = (h ^ (h >> shift)) & MASK32
	return mul32(x, mult)

# ── hash2: [0,1) เสถียรตามพิกัด (ใช้เลือก variant / decoration) ──
static func hash2(x: int, y: int, s: int = 0) -> float:
	var h: int = mul32(x, 374761393)
	h = xor32(h, mul32(y, 668265263))
	h = xor32(h, mul32(s, 2246822519))
	h = mix32(h, 13, 1274126177)
	h = xor32(h, h >> 16)          # ★ ขั้นสุดท้ายเหมือน JS: (h ^ (h >>> 16)) >>> 0
	return float(h) / 4294967296.0

static func hash3(x: int, y: int, z: int, s: int = 0) -> float:
	var h: int = mul32(x, 374761393)
	h = xor32(h, mul32(y, 668265263))
	h = xor32(h, mul32(z, 2147483647))
	h = xor32(h, mul32(s, 2246822519))
	h = mix32(h, 13, 1274126177)
	h = xor32(h, h >> 16)
	return float(h) / 4294967296.0

static func smooth(t: float) -> float:
	return t * t * (3.0 - 2.0 * t)

static func lerpf(a: float, b: float, t: float) -> float:
	return a + (b - a) * t

static func clamp01(v: float) -> float:
	return min(1.0, max(0.0, v))

# ── Value noise 2D ──
func value(x: float, y: float) -> float:
	var x0 := int(floor(x))
	var y0 := int(floor(y))
	var fx := smooth(x - float(x0))
	var fy := smooth(y - float(y0))
	var a := hash2(x0, y0, seed)
	var b := hash2(x0 + 1, y0, seed)
	var c := hash2(x0, y0 + 1, seed)
	var d := hash2(x0 + 1, y0 + 1, seed)
	return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fy)

# ── fBm: ใช้ cfg จาก shared/data/world.json (scale/octaves/persistence/lacunarity/offset) ──
func fbm(x: float, y: float, cfg: Dictionary) -> float:
	var scale: float = float(cfg.get("scale", 0.01))
	var octaves: int = int(cfg.get("octaves", 4))
	var persistence: float = float(cfg.get("persistence", 0.5))
	var lacunarity: float = float(cfg.get("lacunarity", 2.0))
	var ox: float = float(cfg.get("offsetX", 0))
	var oy: float = float(cfg.get("offsetY", 0))
	var sx := (x + ox) * scale
	var sy := (y + oy) * scale
	var amp := 1.0
	var freq := 1.0
	var sum := 0.0
	var norm := 0.0
	for _i in range(octaves):
		sum += amp * value(sx * freq, sy * freq)
		norm += amp
		amp *= persistence
		freq *= lacunarity
	return sum / norm

func ridged(x: float, y: float, cfg: Dictionary) -> float:
	var v := fbm(x, y, cfg)
	return 1.0 - abs(v * 2.0 - 1.0)
