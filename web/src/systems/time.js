// shared/rules/time.js — DAY / NIGHT SYSTEM (Spec ข้อ 12)
export const PHASES = [
  { id: "dawn", name: "รุ่งอรุณ", from: 4.5, to: 6.5 },
  { id: "morning", name: "เช้า", from: 6.5, to: 11 },
  { id: "noon", name: "เที่ยง", from: 11, to: 14 },
  { id: "evening", name: "บ่าย", from: 14, to: 17.5 },
  { id: "sunset", name: "พระอาทิตย์ตก", from: 17.5, to: 19 },
  { id: "night", name: "กลางคืน", from: 19, to: 22 },
  { id: "midnight", name: "ดึก", from: 22, to: 28 },
];

/** แสงตามเวลาของวัน (0 = มืดสนิท, 1 = สว่างสุด) */
const LIGHT_KEYS = [
  [0, 0.10], [4.0, 0.10], [5.2, 0.30], [6.5, 0.72], [8, 0.95], [12, 1.0],
  [15, 0.98], [17.0, 0.82], [18.3, 0.55], [19.5, 0.30], [21, 0.14], [24, 0.10],
];
/** สีฟ้า/ส้มของการเปลี่ยนบรรยากาศ */
const TINT_KEYS = [
  [0, "#0b1330"], [5.0, "#22305c"], [6.2, "#8a6a9a"], [6.9, "#d9a06a"], [8.5, "#ffffff"],
  [16.5, "#ffffff"], [18.2, "#e8a35f"], [19.2, "#6a5a8a"], [20.5, "#141c3f"], [24, "#0b1330"],
];

function sample(keys, h) {
  h = ((h % 24) + 24) % 24;
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (h >= t0 && h <= t1) {
      const k = (h - t0) / (t1 - t0 || 1);
      if (typeof v0 === "number") return v0 + (v1 - v0) * k;
      // hex color lerp
      const c0 = hexToRgb(v0), c1 = hexToRgb(v1);
      return "rgb(" + Math.round(c0.r + (c1.r - c0.r) * k) + "," + Math.round(c0.g + (c1.g - c0.g) * k) + "," + Math.round(c0.b + (c1.b - c0.b) * k) + ")";
    }
  }
  return keys[0][1];
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export class GameTime {
  constructor(cfg) {
    this.dayLengthMinutes = cfg.time.dayLengthMinutes; // เวลาจริงที่นาฬิกาเดิน 1 วัน
    this.hour = cfg.time.startHour;
    this.day = 1;
    this.totalDays = 1;
  }
  /** @param dt เวลาจริงเป็นวินาที */
  update(dt) {
    const hoursPerSec = 24 / (this.dayLengthMinutes * 60);
    this.hour += dt * hoursPerSec;
    while (this.hour >= 24) { this.hour -= 24; this.day++; this.totalDays++; }
  }
  get phase() { return PHASES.find((p) => this.hour >= p.from && this.hour < p.to) || PHASES[6]; }
  get light() { return sample(LIGHT_KEYS, this.hour); }
  get tint() { return sample(TINT_KEYS, this.hour); }
  get isNight() { return this.hour >= 19 || this.hour < 4.5; }
  clockText() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  /** ถึงเวลานอน/NPC (Phase 13) ใช้ค่านี้ */
  get hourOfDay() { return this.hour; }
  serialize() { return { hour: this.hour, day: this.day, totalDays: this.totalDays }; }
  load(s) { if (!s) return; this.hour = s.hour ?? this.hour; this.day = s.day ?? 1; this.totalDays = s.totalDays ?? this.day; }
}
