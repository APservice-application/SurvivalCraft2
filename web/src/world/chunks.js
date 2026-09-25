// shared/rules/chunks.js — CHUNK STREAMING (Spec ข้อ 6, 42)
// โหลดเฉพาะ chunk รอบผู้เล่น, unload ที่ไกลออกไป ไม่โหลดโลกทั้งใบเข้า RAM
import { TILE_ORDER } from "./worldgen.js";

export class ChunkManager {
  constructor(worldgen, cfg, onSpawnProp) {
    this.gen = worldgen;
    this.cfg = cfg;
    this.loadRadius = cfg.world.loadRadius;
    this.keepRadius = cfg.world.keepRadius;
    this.maxCached = cfg.world.maxCachedChunks;
    this.chunks = new Map();
    this.queue = [];
    this.stats = { loaded: 0, generated: 0, unloaded: 0, queued: 0, ms: 0 };
    this.onSpawnProp = onSpawnProp || null;
    this.props = new Map(); // propId → {..} สำหรับ entity ที่ผูกกับ prop (Phase 5)
    this.mtime = 0;
    this.dirtyModifications = new Map(); // "cx,cy" → {tiles:{}, props:{}} (สำหรับ building/farming ใน Phase 7/8)
  }

  key(cx, cy) { return cx + "," + cy; }

  get(cx, cy) { return this.chunks.get(this.key(cx, cy)) || null; }

  /** อัปเดต streaming รอบตำแหน่งผู้เล่น (เรียกทุกเฟรม แต่วิ่งงานจริงแบบจำกัดต่อเฟรม) */
  update(px, py, budgetMs = 4) {
    const S = this.gen.size;
    const ccx = Math.floor(px / S), ccy = Math.floor(py / S);
    const t0 = performance.now();

    // 1) สร้างรายการ chunk ที่ควรมี (เรียงตามระยะใกล้→ไกล เพื่อให้รอบตัวผู้เล่นพร้อมก่อน)
    const want = [];
    const R = this.loadRadius;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > (R + 0.5) * (R + 0.5)) continue;
      const cx = ccx + dx, cy = ccy + dy;
      if (this.chunks.has(this.key(cx, cy))) continue;
      want.push({ cx, cy, d2 });
    }
    want.sort((a, b) => a.d2 - b.d2);
    this.queue = want;

    // 2) generate ตามงบเวลา (ไม่ทำเฟรมค้าง)
    let made = 0;
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const { cx, cy } = this.queue.shift();
      this._load(cx, cy);
      made++;
      if (made > 24) break;
    }
    this.stats.queued = this.queue.length;

    // 3) unload chunk ที่ไกลเกิน keepRadius (แล้วแต่จำนวน cache)
    const keep2 = (this.keepRadius + 0.5) * (this.keepRadius + 0.5);
    const cold = [];
    for (const c of this.chunks.values()) {
      const dx = c.cx - ccx, dy = c.cy - ccy;
      if (dx * dx + dy * dy > keep2) cold.push(c);
    }
    if (cold.length) {
      cold.sort((a, b) => {
        const da = (a.cx - ccx) ** 2 + (a.cy - ccy) ** 2;
        const db = (b.cx - ccx) ** 2 + (b.cy - ccy) ** 2;
        return db - da;
      });
      const mustFree = Math.max(0, this.chunks.size - this.maxCached);
      for (let i = 0; i < Math.max(cold.length, mustFree); i++) {
        if (!cold[i]) break;
        if (i < cold.length && (i < cold.length)) { this._unload(cold[i]); this.stats.unloaded++; }
      }
    }
    this.stats.ms = performance.now() - t0;
    return this.stats;
  }

  _load(cx, cy) {
    const k = this.key(cx, cy);
    const chunk = this.gen.generateChunk(cx, cy);
    chunk.props.forEach((p, i) => {
      p.ui = cx + ":" + cy + ":" + i;
      if (p.solidRef) return;
      const def = this.gen.tilesDb.props[p.type];
      if (def && def.solid) p.blocking = true;
    });
    // นำการแก้ไขจาก save (building/farm) กลับมาใส่
    const mod = this.dirtyModifications.get(k);
    if (mod) {
      if (mod.tiles) for (const [i, t] of Object.entries(mod.tiles)) {
        const ti = TILE_ORDER.indexOf(t);
        if (ti >= 0) chunk.tiles[i | 0] = ti;
      }
      if (mod.solid) for (const [i, v] of Object.entries(mod.solid)) chunk.solid[i | 0] = v;
      if (mod.props) for (const p of mod.props) chunk.props.push({ ...p, fromSave: true });
    }
    this.chunks.set(k, chunk);
    this.stats.loaded = this.chunks.size;
    this.stats.generated++;
    return chunk;
  }

  _unload(chunk) {
    // ก่อนทิ้ง: เก็บเฉพาะ "การแก้ไขของผู้เล่น" (ถ้ามี) — terrain ที่เหลือ deterministic สร้างใหม่ได้
    this.chunks.delete(this.key(chunk.cx, chunk.cy));
    this.stats.loaded = this.chunks.size;
  }

  /** ใช้ตอน save: เก็บเฉพาะ tile/props ที่ผู้เล่นแก้ (ยังไม่มีใน Phase 1 → ว่าง) */
  serializeModifications() {
    const out = {};
    for (const [k, v] of this.dirtyModifications) out[k] = v;
    return out;
  }

  // ── Queries สำหรับ physics / interaction ──────────────────────────
  tileIdAt(tx, ty) {
    const S = this.gen.size;
    const cx = Math.floor(tx / S), cy = Math.floor(ty / S);
    const c = this.get(cx, cy);
    if (!c) return this.gen.tileAt(tx, ty);
    const lx = tx - cx * S, ly = ty - cy * S;
    return TILE_ORDER[c.tiles[ly * S + lx]] || "grass";
  }

  isSolidAt(tx, ty) {
    const S = this.gen.size;
    const cx = Math.floor(tx / S), cy = Math.floor(ty / S);
    const c = this.get(cx, cy);
    const id = this.tileIdAt(tx, ty);
    if (this.gen.isTileSolid(id)) return true;
    if (!c) return false;
    const lx = tx - cx * S, ly = ty - cy * S;
    return c.solid[ly * S + lx] === 1;
  }

  /** ความเร็วเดินตาม tile (หญ้า 1.0 / โคลน 0.65 / ทางเดิน 1.15) */
  speedAt(tx, ty) {
    const t = this.gen.tilesDb.tiles[this.tileIdAt(tx, ty)];
    return t ? (t.speed === undefined ? 1 : t.speed) : 1;
  }

  /** ผู้เล่นอยู่ในน้ำไหม (สำหรับ wet/cold ใน Phase 9) */
  isLiquidAt(tx, ty) {
    const t = this.gen.tilesDb.tiles[this.tileIdAt(tx, ty)];
    return !!(t && t.liquid);
  }

  biomeAt(x, y) { return this.gen.biomeAt(Math.floor(x), Math.floor(y)); }

  /** props ในพื้นที่ (Phase 5 gathering จะใช้) */
  propsInRect(x0, y0, x1, y1) {
    const S = this.gen.size;
    const out = [];
    for (const c of this.chunks.values()) {
      if (c.ox > x1 || c.oy > y1 || c.ox + S < x0 || c.oy + S < y0) continue;
      for (const p of c.props) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) out.push(p);
    }
    return out;
  }

  nearestProp(x, y, maxDist = 1.6) {
    let best = null, bd = maxDist * maxDist;
    for (const p of this.propsInRect(x - maxDist, y - maxDist, x + maxDist, y + maxDist)) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
