// shared/rules/worldgen.js — WORLD GENERATOR (Spec ข้อ 4, 5, 41)
// Deterministic: seed เดียวกัน → โลกเดียวกันทุกครั้ง (ไม่ต้องบันทึกทุก tile ลง save)
import { Noise, hash2, hash3, clamp } from "../core/math.js";

export const TILE_ORDER = [
  "deep_water", "water", "sand", "grass", "lush_grass", "forest_floor", "dirt",
  "farmland", "stone", "rock", "snow", "mud", "road", "magic_ground",
];

export class WorldGen {
  /**
   * @param {object} cfg      world.json
   * @param {object} tilesDb  tiles.json
   * @param {object} biomesDb biomes.json
   * @param {number} seed
   */
  constructor(cfg, tilesDb, biomesDb, seed) {
    this.cfg = cfg;
    this.tilesDb = tilesDb;
    this.biomesDb = biomesDb;
    this.seed = seed | 0;
    this.size = cfg.world.chunkSize;
    this.n = cfg.terrainNoise;
    this.th = cfg.thresholds;
    this.temps = cfg.temperatures;
    this.moist = cfg.moistureLevels;
    // noise instances แยกกันเพื่อไม่ให้ field ทับกัน
    this.noise = {
      continent: new Noise(this.seed + 11),
      elevation: new Noise(this.seed + 23),
      moisture: new Noise(this.seed + 37),
      temperature: new Noise(this.seed + 53),
      detail: new Noise(this.seed + 71),
      river: new Noise(this.seed + 97),
      cave: new Noise(this.seed + 131),
      cluster: new Noise(this.seed + 173),
      clearing: new Noise(this.seed + 211),
      structure: new Noise(this.seed + 251),
    };
    this._biomeCache = new Map();
  }

  // ── Terrain fields ────────────────────────────────────────────────
  continentAt(x, y) {
    const c = this.noise.continent.fbm(x, y, this.n.continent);
    // ลด noise ที่ขอบโลกเล็กน้อยให้ชายฝั่งดูเป็นธรรมชาติ
    return c;
  }
  elevationAt(x, y) {
    const e = this.noise.elevation.fbm(x, y, this.n.elevation);
    const c = this.continentAt(x, y);
    const cw = clamp((c - this.th.water) / 0.25, 0, 1); // ที่ราบสูงเฉพาะบนแผ่นดิน
    return clamp(e * 0.55 + (1 - c) * 0.45 * 0 + cw * 0.55 - 0.05, 0, 1);
  }
  moistureAt(x, y) { return this.noise.moisture.fbm(x, y, this.n.moisture); }
  temperatureAt(x, y) { return this.noise.temperature.fbm(x, y, this.n.temperature); }
  riverAt(x, y) { return this.noise.river.ridged(x, y, { scale: 0.004, octaves: 3, persistence: 0.5, lacunarity: 2, offsetX: 12000, offsetY: 3400 }); }

  /** ระดับความสูงเชิงสัมพันธ์ 0..1 (continent + elevation รวมแล้ว) */
  heightAt(x, y) {
    const c = this.continentAt(x, y);
    const e = this.elevationAt(x, y);
    return clamp(c * 0.72 + e * 0.28, 0, 1);
  }

  // ── Biome ─────────────────────────────────────────────────────────
  biomeAt(x, y) {
    const key = x + "," + y;
    const cached = this._biomeCache.get(key);
    if (cached) return cached;
    const b = this._computeBiome(x, y);
    if (this._biomeCache.size > 60000) this._biomeCache.clear();
    this._biomeCache.set(key, b);
    return b;
  }

  _computeBiome(x, y) {
    const c = this.continentAt(x, y);
    const e = this.elevationAt(x, y);
    const m = this.moistureAt(x, y);
    const t = this.temperatureAt(x, y);
    const h = this.heightAt(x, y);

    if (c < this.th.deepWater) return "deep_ocean";
    if (c < this.th.water) return "ocean";
    if (c < this.th.beach) return "beach";

    // น้ำจืด: แม่น้ำ/ทะเลสาบบนแผ่นดิน
    const rv = this.riverAt(x, y);
    if (rv > 0.955 && h > 0.33 && h < this.th.snow) return "river";

    // ภูเขา/หิมะ ยึดตามความสูงเป็นหลัก
    if (h > this.th.snow) return "snow";
    if (h > this.th.mountain) {
      const mm = this.moistureAt(x, y);
      return mm > 0.6 ? "snow" : "mountain";
    }

    // เขตเวทมนตร์: noise พิเศษ + ความชื้นสูง
    const magic = hash3(Math.floor(x / 8), Math.floor(y / 8), 7, this.seed) ;
    if (magic > 0.992 && m > 0.45 && t > this.temps.polarBelow) return "magical_area";

    // ซากปรักหักพังเป็นหย่อม
    const ruin = this.noise.structure.fbm(x, y, this.n.detail);
    if (ruin > 0.82 && m > 0.25 && m < 0.7) return "ruins";

    const hot = t > this.temps.hotAbove;
    const cold = t < this.temps.coldBelow;
    const polar = t < this.temps.polarBelow;
    const wet = m > this.moist.wetBelow;
    const dry = m < this.moist.aridBelow;
    const normal = m >= this.moist.aridBelow && m < this.moist.wetBelow;

    if (polar) return wet ? "snow" : "mountain";
    if (cold) return wet ? "forest" : "plains";
    if (hot && dry) return "desert";
    if (hot) return wet ? "deep_forest" : "plains";
    if (dry) return m < this.moist.dryBelow ? "desert" : "plains";
    if (wet) return "swamp";
    if (normal) return m > this.moist.normalBelow ? "deep_forest" : "forest";
    return "grassland";
  }

  // ── Tiles ─────────────────────────────────────────────────────────
  /** เลือก tile จาก biome terrain table + variation (deterministic ตามพิกัด) */
  tileAt(x, y) {
    const biome = this.biomeAt(x, y);
    const def = this.biomesDb.biomes[biome];
    const pick = hash2(x, y, this.seed + 9001);
    let acc = 0, chosen = null;
    for (const [tile, w] of Object.entries(def.terrain)) {
      acc += w;
      if (pick <= acc) { chosen = tile; break; }
      chosen = tile;
    }
    chosen = chosen || "grass";

    // ทางเดินดิน (footpath) ตามแนว noise เบา ๆ เพื่อไม่ให้โลกดูเป็นบล็อกสุ่ม
    if (chosen === "grass" || chosen === "forest_floor" || chosen === "lush_grass") {
      const p = this.noise.structure.fbm(x, y, { scale: 0.012, octaves: 2, persistence: 0.5, lacunarity: 2, offsetX: 5000, offsetY: 8000 });
      if (p > 0.735 && p < 0.752) return "road";
    }
    return chosen;
  }

  /** tile id → index (ใช้เก็บใน Uint8Array ให้ประหยัดหน่วยความจำ) */
  tileIndex(tileId) { return TILE_ORDER.indexOf(tileId); }
  tileFromIndex(i) { return TILE_ORDER[i] || "grass"; }

  isTileSolid(tileId) {
    const t = this.tilesDb.tiles[tileId];
    return !!(t && t.solid);
  }

  // ── Chunk generation ─────────────────────────────────────────────
  /**
   * สร้าง chunk (deterministic) — เรียกซ้ำได้เสมอ ได้ผลเดิม
   * @returns {{cx:number,cy:number,tiles:Uint8Array,props:Array,solid:Uint8Array,biome:string}}
   */
  generateChunk(cx, cy) {
    const S = this.size;
    const ox = cx * S, oy = cy * S;
    const tiles = new Uint8Array(S * S);
    const solid = new Uint8Array(S * S);
    const props = [];
    const propGrid = new Uint8Array(S * S).fill(255);
    const cr = this.cfg.decorRules;
    let biomeCounts = {};

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wy = oy + y;
        const tileId = this.tileAt(wx, wy);
        const idx = TILE_ORDER.indexOf(tileId);
        tiles[y * S + x] = idx < 0 ? 3 : idx;
        if (this.isTileSolid(tileId)) solid[y * S + x] = 1;
        const bn = this.biomeAt(wx, wy);
        biomeCounts[bn] = (biomeCounts[bn] || 0) + 1;
      }
    }

    // biome หลักของ chunk (ใช้เลือกเพลง/ambient/UI)
    let mainBiome = "grassland", best = -1;
    for (const [bn, n] of Object.entries(biomeCounts)) if (n > best) { best = n; mainBiome = bn; }

    // ── vegetation + decoration ตามกติกา (กฎกันโลกดูเหมือนบล็อกสุ่ม) ──
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wy = oy + y;
        const tileId = this.tileFromIndex(tiles[y * S + x]);
        const tdef = this.tilesDb.tiles[tileId];
        if (tdef.liquid) continue;                       // ไม่วางของในน้ำ

        const biome = this.biomeAt(wx, wy);
        const bdef = this.biomesDb.biomes[biome];
        const r = hash2(wx, wy, this.seed + 31337);
        const waterNeighbor = this._nearLiquid(wx, wy, 1);
        if (waterNeighbor && cr.edgeAvoidLiquid) continue;

        let clusterMul = 1;
        if (cr.clusterTrees) {
          const cf = this.noise.cluster.value(wx * cr.forestCluster.scale, wy * cr.forestCluster.scale);
          if (cf > cr.forestCluster.threshold) clusterMul = cr.forestCluster.bonus;
          const cl = this.noise.clearing.value(wx * cr.clearings.scale, wy * cr.clearings.scale);
          if (cl > cr.clearings.threshold) clusterMul *= cr.clearings.multiplier;
        }

        // 1) vegetation (ต้นไม้) — เช็คกันชนกับ prop ข้างเคียง
        let placed = false;
        for (const [propId, density] of Object.entries(bdef.vegetation || {})) {
          const d = density * clusterMul * cr.densityScale;
          if (d <= 0) continue;
          if (hash2(wx, wy, this.seed + propId.length * 7717) < d && !this._propNearby(propGrid, S, x, y)) {
            const size = this.tilesDb.props[propId].size || 1;
            props.push({ type: propId, tx: wx, ty: wy, x: wx + 0.5 + (hash2(wx, wy, 5) - 0.5) * 0.5, y: wy + 0.5 + (hash2(wx, wy, 6) - 0.5) * 0.5, s: 1 + (hash2(wx, wy, 7) - 0.5) * 0.18, flip: hash2(wx, wy, 9) > 0.5, v: Math.floor(hash2(wx, wy, 11) * 1000) });
            propGrid[y * S + x] = props.length - 1;
            if (this.tilesDb.props[propId].solid) solid[y * S + x] = 1;
            placed = true;
            break;
          }
        }
        if (placed) continue;

        // 2) decoration (หญ้า/ดอกไม้/หินเล็ก/เห็ด)
        for (const [propId, density] of Object.entries(bdef.decoration || {})) {
          const d = density * cr.densityScale;
          if (d <= 0) continue;
          if (hash2(wx, wy, this.seed + propId.length * 4201) < d) {
            props.push({ type: propId, tx: wx, ty: wy, x: wx + 0.5 + (hash2(wx, wy, 21) - 0.5) * 0.8, y: wy + 0.5 + (hash2(wx, wy, 22) - 0.5) * 0.8, s: 0.85 + hash2(wx, wy, 23) * 0.3, flip: hash2(wx, wy, 24) > 0.5, v: Math.floor(hash2(wx, wy, 25) * 1000) });
            propGrid[y * S + x] = props.length - 1;
            break;
          }
        }
      }
    }

    return { cx, cy, ox, oy, tiles, solid, props, biome: mainBiome, biomeCounts };
  }

  _propNearby(propGrid, S, x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      if (propGrid[ny * S + nx] !== 255) return true;
    }
    return false;
  }

  _nearLiquid(wx, wy, radius) {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      const b = this.biomeAt(wx + dx, wy + dy);
      if (b === "ocean" || b === "deep_ocean" || b === "river" || b === "lake") return true;
    }
    return false;
  }

  /** ตรวจว่าพื้นที่รอบจุดหนึ่งไม่มี prop ที่เป็นของทึบ (ใช้เลือกจุดเกิดไม่ให้ติดต้นไม้/ก้อนหิน)
   *  ใช้ generateChunk จริง (deterministic) จึงสอดคล้องกับโลกที่จะถูกสร้างจริง 100% */
  areaClearOfProps(x, y, radius = 1.35) {
    const S = this.size;
    const cx = Math.floor(x / S), cy = Math.floor(y / S);
    const seen = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const key = (cx + dx) + "," + (cy + dy);
      if (seen.has(key)) continue;
      seen.add(key);
      const ch = this.generateChunk(cx + dx, cy + dy);
      for (const p of ch.props) {
        const def = this.tilesDb.props[p.type];
        if (!def || !def.solid) continue;
        const rr = radius + (def.radius || 0.45);
        if ((p.x - x) ** 2 + (p.y - y) ** 2 < rr * rr) return false;
      }
    }
    return true;
  }

  /** หาจุดเกิดที่ปลอดภัย: แผ่นดิน ไม่มีน้ำ/ผาหิน และไม่มีต้นไม้ทึบขวางอยู่ */
  findSpawn(startX = 0, startY = 0, maxRing = 220) {
    for (let ring = 0; ring < maxRing; ring++) {
      const count = ring === 0 ? 1 : ring * 8;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const x = Math.round(startX + Math.cos(a) * ring * 2);
        const y = Math.round(startY + Math.sin(a) * ring * 2);
        const b = this.biomeAt(x, y);
        const bad = b === "ocean" || b === "deep_ocean" || b === "river" || b === "lake" || b === "mountain" || b === "snow" || b === "swamp" || b === "cave";
        if (bad) continue;
        if (this.heightAt(x, y) <= this.th.water || this.heightAt(x, y) >= 0.55) continue;
        if (this.isTileSolid(this.tileAt(x, y))) continue;
        if (!this.areaClearOfProps(x + 0.5, y + 0.5, 1.4)) continue;
        return { x: x + 0.5, y: y + 0.5, biome: b };
      }
    }
    return { x: startX + 0.5, y: startY + 0.5, biome: "grassland" };
  }
}
