// shared/rules/weather.js — WEATHER SYSTEM (Spec ข้อ 13)
// อากาศส่งผลจริง: ฝนเพิ่มความชื้นดิน, ลด visibility, ทำให้ตัวเปียก, บาง biome มีหิมะ
import { makeRng } from "../core/math.js";

export const WEATHER_DEF = {
  clear: { id: "clear", name: "ท้องฟ้าแจ่มใส", visual: "none", lightMul: 1.0, moistureGain: 0, visibility: 1.0, tempDelta: 0 },
  cloudy: { id: "cloudy", name: "มีเมฆ", visual: "none", lightMul: 0.92, moistureGain: 0.02, visibility: 0.97, tempDelta: -0.6 },
  rain: { id: "rain", name: "ฝนตก", visual: "rain", lightMul: 0.78, moistureGain: 0.9, visibility: 0.82, tempDelta: -1.6, wetness: 0.12 },
  heavy_rain: { id: "heavy_rain", name: "ฝนหนัก", visual: "heavy_rain", lightMul: 0.66, moistureGain: 1.6, visibility: 0.66, tempDelta: -2.6, wetness: 0.28, movePenalty: 0.92 },
  storm: { id: "storm", name: "พายุ", visual: "storm", lightMul: 0.5, moistureGain: 2.2, visibility: 0.5, tempDelta: -3.4, wetness: 0.4, movePenalty: 0.86, danger: true },
  fog: { id: "fog", name: "หมอก", visual: "fog", lightMul: 0.72, moistureGain: 0.3, visibility: 0.45, tempDelta: -1.0 },
  snow: { id: "snow", name: "หิมะตก", visual: "snow", lightMul: 0.85, moistureGain: 0.4, visibility: 0.7, tempDelta: -4.0, wetness: 0.1, cold: true },
  heat: { id: "heat", name: "อากาศร้อนจัด", visual: "none", lightMul: 1.05, moistureGain: -0.6, visibility: 1.0, tempDelta: 5.0, thirstMul: 1.5 },
  wind: { id: "wind", name: "ลมแรง", visual: "none", lightMul: 0.96, moistureGain: 0, visibility: 0.9, tempDelta: -1.2 },
};

export class Weather {
  constructor(cfg, biomeDb, seed) {
    this.cfg = cfg.weather;
    this.biomeDb = biomeDb;
    this.rng = makeRng(seed + 77771);
    this.current = WEATHER_DEF.clear;
    this.timeLeft = 120;
    this.blend = 0;
  }

  update(dt, ctx) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this._roll(ctx);
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt * 0.5);
  }

  /** สุ่มสภาพอากาศแบบถ่วงน้ำหนัก ปรับตาม biome/ฤดูกาล/เวลา (deterministic จาก seed) */
  _roll(ctx) {
    const biome = ctx.biome || "grassland";
    const bdef = this.biomeDb.biomes[biome] || {};
    const hour = ctx.hour ?? 12;
    const table = { ...this.cfg.types };
    let id = "clear";
    const entries = Object.entries(table).map(([key, w]) => {
      let weight = w;
      const humid = bdef.humidity ?? 0.5;
      const temp = bdef.temperature ?? 20;
      // กฎโลก: ฝนมากในที่ชื้น ฝนน้อยในทะเลทราย
      if (key === "rain" || key === "heavy_rain" || key === "storm") weight *= humid < 0.2 ? 0.15 : humid > 0.85 ? 2.1 : 1;
      // หิมะตกได้เฉพาะอากาศหนาว (ที่อุณหภูมิ biome > 8°C = เป็นไปไม่ได้)
      if (key === "snow") weight = temp <= 2 ? weight * 5 : temp <= 8 ? weight * 0.5 : 0;
      // อากาศร้อนจัดเฉพาะที่อุณหภูมิสูง
      if (key === "heat") weight = temp > 35 ? weight * 3 : temp > 29 ? weight * 0.6 : 0;
      // หมอกเกิดบ่อยช่วงเช้ามืด
      if (key === "fog") weight *= (hour >= 4 && hour <= 8) ? 2.4 : 0.6;
      return [key, weight];
    });
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.rng() * total;
    for (const [key, w] of entries) { roll -= w; if (roll <= 0) { id = key; break; } }

    this.current = WEATHER_DEF[id] || WEATHER_DEF.clear;
    this.timeLeft = this.cfg.changeEveryMinutes * 60 * (0.65 + this.rng() * 0.9);
    this.blend = 0;
    this.changed = true;
  }

  get visual() { return this.current.visual; }
  get name() { return this.current.name; }
  get lightMul() { return this.current.lightMul; }
  get movePenalty() { return this.current.movePenalty || 1; }
  get isRain() { return ["rain", "heavy_rain", "storm"].includes(this.current.id); }
  get isSnow() { return this.current.id === "snow"; }
  serialize() { return { id: this.current.id, timeLeft: this.timeLeft }; }
  load(s) { if (s && s.id && WEATHER_DEF[s.id]) { this.current = WEATHER_DEF[s.id]; this.timeLeft = s.timeLeft ?? 120; } }
}
