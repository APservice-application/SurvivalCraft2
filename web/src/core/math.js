// shared/rules/math.js — คณิตศาสตร์พื้นฐาน + RNG + Noise (ใช้ร่วม Web/Godot logic, deterministic)
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);

/** RNG แบบ deterministic (mulberry32) — seed เดียวกันได้ผลเหมือนกันทุกเครื่อง */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** hash 2D → [0,1) ใช้สำหรับ variant/decoration ที่ต้องเสถียรตามพิกัด */
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise 2D + fBm — ให้ภูมิประเทศที่ต่อเนื่องและ deterministic */
export class Noise {
  constructor(seed = 1337) { this.seed = seed | 0; }

  value(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = hash2(x0, y0, this.seed);
    const b = hash2(x0 + 1, y0, this.seed);
    const c = hash2(x0, y0 + 1, this.seed);
    const d = hash2(x0 + 1, y0 + 1, this.seed);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  /** fBm: scale/octaves/persistence/lacunarity + offset จาก world.json */
  fbm(x, y, cfg) {
    const { scale = 0.01, octaves = 4, persistence = 0.5, lacunarity = 2.0, offsetX = 0, offsetY = 0 } = cfg || {};
    let sx = (x + offsetX) * scale, sy = (y + offsetY) * scale;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.value(sx * freq, sy * freq);
      norm += amp;
      amp *= persistence; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** ridged noise — ใช้ทำสันเขา/แม่น้ำ */
  ridged(x, y, cfg) {
    const v = this.fbm(x, y, cfg);
    return 1 - Math.abs(v * 2 - 1);
  }
}

/** คูณแบบ 32-bit wraparound (เทียบเท่า Math.imul) — ใช้สำหรับ hash ที่ต้องตรงกันข้ามภาษา */
export function mul32(a, b) {
  a |= 0; b |= 0;
  const aLo = a & 0xffff, aHi = (a >> 16) & 0xffff;
  const bLo = b & 0xffff, bHi = (b >> 16) & 0xffff;
  return (aLo * bLo + (((aHi * bLo + aLo * bHi) & 0xffff) << 16)) | 0;
}
