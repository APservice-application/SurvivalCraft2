// web/src/render/tiles.js — สร้าง Texture ของ Tile และ Prop แบบ procedural
// ตาม Spec ข้อ 9 (ห้ามใช้สีพื้นเรียบ) — ทุก tile มี texture variation / edge / decoration
import { makeRng, hash2 } from "../core/math.js";
import { TILE_ORDER } from "../world/worldgen.js";

export const VARIANTS = 8;          // จำนวน variant ต่อ 1 tile type (Spec ข้อ 8: Variant Tile)
export const ANIM_FRAMES = 4;       // สำหรับ tile ที่เคลื่อนไหว (น้ำ)

export class TileTextureCache {
  constructor(tilesDb, scale = 2) {
    this.db = tilesDb;
    this.ts = tilesDb.tileSize;      // 16 px ต้นฉบับ
    this.scale = scale;              // ขยายเป็น 32 px ต่อ tile เพื่อความคม
    this.px = this.ts * scale;
    this.cache = new Map();          // "tileId:v:frame" → canvas
    this.propCache = new Map();      // "propId:v" → {canvas, ax, ay}
  }

  key(tileId, v, f = 0) { return tileId + ":" + v + ":" + f; }

  _blank(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return { c, ctx };
  }

  /** สร้าง canvas ของ tile 1 variant (memoized) */
  get(tileId, variant, frame = 0) {
    const k = this.key(tileId, variant, frame);
    let cv = this.cache.get(k);
    if (!cv) { cv = this._makeTile(tileId, variant, frame); this.cache.set(k, cv); }
    return cv;
  }

  _makeTile(tileId, variant, frame) {
    const def = this.db.tiles[tileId] || this.db.tiles.grass;
    const tex = def.texture || { base: "#4c8a3f", palette: ["#4c8a3f"] };
    const P = this.px;
    const { c, ctx } = this._blank(P, P);
    const rng = makeRng((variant + 1) * 7919 + tileId.length * 104729 + frame * 6151);
    const palette = tex.palette && tex.palette.length ? tex.palette : [tex.base];

    // 1) พื้นฐาน: sub-block ละเอียด 2px + สลับเฉดสี (ไม่ใช่สีเรียบ — Spec ข้อ 9)
    const cell = Math.max(2, Math.round(P / 16));
    for (let y = 0; y < P; y += cell) {
      for (let x = 0; x < P; x += cell) {
        const r = rng();
        const n = tex.noise ?? 0.3;
        ctx.fillStyle = r < 0.36 ? palette[0] : r < 0.72 ? palette[1 % palette.length] : palette[(2 + Math.floor(r * palette.length)) % palette.length];
        ctx.globalAlpha = 1 - n * 0.5 + rng() * n * 0.5;
        ctx.fillRect(x, y, cell, cell);
      }
    }
    // เกรนละเอียดระดับพิกเซล (ตัดความแบนของสี)
    for (let y = 0; y < P; y += 1) {
      for (let x = 0; x < P; x += 1) {
        const g = (rng() - 0.5) * (tex.noise ?? 0.3) * 0.42;
        if (Math.abs(g) < 0.05) continue;
        ctx.globalAlpha = Math.abs(g);
        ctx.fillStyle = g > 0 ? "#ffffff" : "#000000";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = tex.base;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(0, 0, P, P);
    ctx.globalAlpha = 1;

    // 2) features ตามชนิด tile (หญ้า/กรวด/รอยแตก/คลื่น/ร่องไถ)
    for (const f of tex.features || []) {
      const count = Math.round((f.count || 10) * (P / 32) * 1.35);
      const size = (f.size || 1) * this.scale;
      ctx.strokeStyle = f.color; ctx.fillStyle = f.color;
      ctx.globalAlpha = f.alpha ?? 0.5;
      if (f.type === "wave") {
        ctx.lineWidth = Math.max(1, this.scale);
        for (let i = 0; i < count; i++) {
          const y = Math.round(rng() * P) + (frame * P * 0.25) % P;
          const x = Math.round(rng() * P);
          const w = 6 + rng() * 10;
          ctx.beginPath();
          ctx.moveTo(x, y % P);
          ctx.quadraticCurveTo(x + w / 2, (y % P) - 2 * this.scale, x + w, y % P);
          ctx.stroke();
        }
      } else if (f.type === "blade") {
        ctx.lineWidth = Math.max(1, size * 0.6);
        for (let i = 0; i < count; i++) {
          const x = rng() * P, y = rng() * P;
          const h = size * (1.2 + rng() * 1.6);
          const lean = (rng() - 0.5) * size;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + lean * 0.5, y - h * 0.6, x + lean, y - h);
          ctx.stroke();
        }
      } else if (f.type === "crack") {
        ctx.lineWidth = Math.max(1, this.scale * 0.8);
        for (let i = 0; i < count; i++) {
          let x = rng() * P, y = rng() * P;
          ctx.beginPath(); ctx.moveTo(x, y);
          const segs = 2 + Math.floor(rng() * 3);
          for (let s = 0; s < segs; s++) {
            x += (rng() - 0.5) * size * 3;
            y += (rng() - 0.5) * size * 3;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (f.type === "furrow") {
        ctx.lineWidth = Math.max(1, this.scale);
        for (let i = 0; i < count; i++) {
          const y = ((i + 0.5) / count) * P;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(P, y); ctx.stroke();
        }
      } else if (f.type === "glow_dot") {
        for (let i = 0; i < count; i++) {
          const x = rng() * P, y = rng() * P, r = size * (0.5 + rng());
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
          g.addColorStop(0, f.color); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
        }
      } else { // speckle / pebble
        for (let i = 0; i < count; i++) {
          const x = rng() * P, y = rng() * P;
          const r = size * (f.type === "pebble" ? 0.8 + rng() * 0.9 : 0.4 + rng() * 0.6);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;

    // 3) ขอบเข้มเล็กน้อยให้แต่ละ tile มีมิติ (ไม่แบนราบ)
    const grd = ctx.createLinearGradient(0, 0, 0, P);
    grd.addColorStop(0, "rgba(255,255,255,0.05)");
    grd.addColorStop(1, "rgba(0,0,0,0.07)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, P, P);
    return c;
  }

  /** สไปรต์ของ prop (ต้นไม้/ก้อนหิน/ดอกไม้) — วาดครั้งเดียวแล้ว cache */
  getProp(propId, variant) {
    const k = propId + ":" + variant;
    let p = this.propCache.get(k);
    if (!p) { p = this._makeProp(propId, variant); this.propCache.set(k, p); }
    return p;
  }

  _makeProp(propId, variant) {
    const def = this.db.props[propId];
    if (!def) return null;
    const r = def.render || {};
    const tiles = def.size || 1;
    const W = this.px * tiles, H = this.px * tiles + this.px * 0.6;
    const { c, ctx } = this._blank(W, H);
    const rng = makeRng(variant * 2654435761 + propId.length * 40503);
    const cx = W / 2;
    const baseY = H - this.px * 0.25;             // จุดฐาน (y กึ่งกลางล่าง) — ใช้ anchor กับพื้น
    const leaf = r.leaf || [r.base || "#3b7f37", r.shade || "#2f6b2f"];

    const shadow = (rx, ry, alpha = 0.26) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(cx, baseY, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    const blob = (x, y, rr, color, alpha = 1) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    };

    switch (r.shape) {
      case "round": {   // ต้นไม้ใบกว้าง
        const th = this.px * 0.32, trunkH = this.px * (1.15 + rng() * 0.35);
        shadow(this.px * 0.55, this.px * 0.22);
        ctx.fillStyle = r.trunk; ctx.fillRect(cx - th / 2, baseY - trunkH, th, trunkH);
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.fillRect(cx + th / 2 - th * 0.28, baseY - trunkH, th * 0.28, trunkH);
        const R = this.px * (0.72 + rng() * 0.2);
        const topY = baseY - trunkH - R * 0.55;
        blob(cx, topY, R, leaf[0]);
        blob(cx - R * 0.55, topY + R * 0.25, R * 0.66, leaf[1 % leaf.length]);
        blob(cx + R * 0.5, topY + R * 0.3, R * 0.6, leaf[2 % leaf.length]);
        blob(cx - R * 0.15, topY - R * 0.4, R * 0.5, "#ffffff", 0.14);   // ไฮไลต์แสง
        blob(cx + R * 0.1, topY - R * 0.7, R * 0.28, "#ffffff", 0.10);
        break;
      }
      case "cone": {    // ต้นสน
        const trunkH = this.px * 0.5;
        shadow(this.px * 0.45, this.px * 0.18);
        ctx.fillStyle = r.trunk; ctx.fillRect(cx - this.px * 0.12, baseY - trunkH, this.px * 0.24, trunkH);
        const layers = 3;
        for (let i = 0; i < layers; i++) {
          const t = i / (layers - 1);
          const w = this.px * (1.55 - t * 0.85);
          const y = baseY - trunkH - t * this.px * 1.5;
          const h = this.px * (1.05 - t * 0.35);
          ctx.fillStyle = leaf[i % leaf.length];
          ctx.beginPath(); ctx.moveTo(cx, y - h); ctx.lineTo(cx - w / 2, y); ctx.lineTo(cx + w / 2, y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.16)";
          ctx.beginPath(); ctx.moveTo(cx, y - h); ctx.lineTo(cx + w / 2, y); ctx.lineTo(cx + w * 0.15, y); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case "palm": {
        const trunkH = this.px * 1.6;
        shadow(this.px * 0.5, this.px * 0.2);
        ctx.strokeStyle = r.trunk; ctx.lineWidth = this.px * 0.16; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(cx, baseY); ctx.quadraticCurveTo(cx + this.px * 0.25, baseY - trunkH * 0.6, cx + this.px * 0.1, baseY - trunkH); ctx.stroke();
        const tx = cx + this.px * 0.1, ty = baseY - trunkH;
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.5;
          const L = this.px * (0.75 + rng() * 0.25);
          ctx.strokeStyle = leaf[i % leaf.length]; ctx.lineWidth = this.px * 0.12;
          ctx.beginPath(); ctx.moveTo(tx, ty);
          ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - this.px * 0.12, tx + Math.cos(a) * L, ty + Math.sin(a) * L + this.px * 0.1);
          ctx.stroke();
        }
        break;
      }
      case "bush": {
        shadow(this.px * 0.42, this.px * 0.16);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          blob(cx + Math.cos(a) * this.px * 0.28, baseY - this.px * 0.35 + Math.sin(a) * this.px * 0.18, this.px * 0.32, i % 3 === 0 ? "#3d7a3f" : r.base);
        }
        for (let i = 0; i < 4; i++) blob(cx + (rng() - 0.5) * this.px * 0.7, baseY - this.px * 0.4 + (rng() - 0.5) * this.px * 0.4, this.px * 0.1, r.fruit || "#c8324b");
        blob(cx - this.px * 0.2, baseY - this.px * 0.7, this.px * 0.2, "#ffffff", 0.12);
        break;
      }
      case "herb": case "flower": {
        shadow(this.px * 0.3, this.px * 0.12, 0.2);
        const stalks = r.shape === "flower" ? 3 : 5;
        for (let i = 0; i < stalks; i++) {
          const x = cx + (rng() - 0.5) * this.px * 0.7;
          const h = this.px * (0.35 + rng() * 0.35);
          ctx.strokeStyle = r.base; ctx.lineWidth = Math.max(1, this.px * 0.06);
          ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x + (rng() - 0.5) * 3, baseY - h); ctx.stroke();
          if (r.shape === "flower") {
            ctx.fillStyle = r.fruit; ctx.beginPath(); ctx.arc(x, baseY - h, this.px * 0.13, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#ffe9a8"; ctx.beginPath(); ctx.arc(x, baseY - h, this.px * 0.05, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.fillStyle = r.fruit || "#d8e07a"; ctx.beginPath(); ctx.arc(x, baseY - h, this.px * 0.07, 0, Math.PI * 2); ctx.fill();
          }
        }
        break;
      }
      case "reed": {
        shadow(this.px * 0.3, this.px * 0.1, 0.18);
        for (let i = 0; i < 6; i++) {
          const x = cx + (rng() - 0.5) * this.px * 0.8;
          const h = this.px * (0.6 + rng() * 0.6);
          ctx.strokeStyle = r.base; ctx.lineWidth = Math.max(1, this.px * 0.05);
          ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x + 2, baseY - h * 0.7, x + (rng() - 0.5) * 6, baseY - h); ctx.stroke();
          ctx.fillStyle = r.fruit || "#b6a24f";
          ctx.fillRect(x - 1, baseY - h - this.px * 0.18, 2.2, this.px * 0.22);
        }
        break;
      }
      case "cactus": {
        shadow(this.px * 0.35, this.px * 0.14);
        ctx.fillStyle = r.base;
        const bw = this.px * 0.42, bh = this.px * 1.1;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - bw / 2, baseY - bh, bw, bh, bw * 0.4) : ctx.rect(cx - bw / 2, baseY - bh, bw, bh); ctx.fill();
        ctx.fillStyle = r.shade; ctx.fillRect(cx + bw * 0.1, baseY - bh, bw * 0.4, bh);
        ctx.fillStyle = r.base;
        ctx.fillRect(cx - bw * 1.1, baseY - bh * 0.72, bw * 0.55, bh * 0.42);
        ctx.fillRect(cx + bw * 0.6, baseY - bh * 0.85, bw * 0.5, bh * 0.5);
        ctx.strokeStyle = "#e8e0b0"; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const y = baseY - bh * (0.15 + i * 0.18);
          ctx.beginPath(); ctx.moveTo(cx - bw * 0.3, y); ctx.lineTo(cx + bw * 0.35, y); ctx.stroke();
        }
        break;
      }
      case "mushroom": {
        shadow(this.px * 0.24, this.px * 0.1, 0.2);
        ctx.fillStyle = r.base;
        ctx.fillRect(cx - this.px * 0.07, baseY - this.px * 0.34, this.px * 0.14, this.px * 0.34);
        ctx.fillStyle = r.fruit;
        ctx.beginPath(); ctx.ellipse(cx, baseY - this.px * 0.34, this.px * 0.26, this.px * 0.2, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.globalAlpha = 0.7;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - this.px * 0.12 + i * this.px * 0.12, baseY - this.px * 0.4, this.px * 0.04, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        break;
      }
      case "crystal": {
        shadow(this.px * 0.3, this.px * 0.12, 0.22);
        const g = ctx.createLinearGradient(cx, baseY - this.px, cx, baseY);
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, r.base); g.addColorStop(1, r.shade);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx, baseY - this.px * (1.0 + rng() * 0.3));
        ctx.lineTo(cx + this.px * 0.28, baseY - this.px * 0.45);
        ctx.lineTo(cx + this.px * 0.15, baseY);
        ctx.lineTo(cx - this.px * 0.15, baseY);
        ctx.lineTo(cx - this.px * 0.28, baseY - this.px * 0.45);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.45; ctx.fillStyle = "#d9c6ff";
        ctx.beginPath(); ctx.moveTo(cx, baseY - this.px * 0.95); ctx.lineTo(cx - this.px * 0.1, baseY - this.px * 0.3); ctx.lineTo(cx + this.px * 0.06, baseY - this.px * 0.3); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case "pillar": {
        shadow(this.px * 0.38, this.px * 0.15);
        ctx.fillStyle = r.base;
        ctx.fillRect(cx - this.px * 0.22, baseY - this.px * 1.35, this.px * 0.44, this.px * 1.35);
        ctx.fillStyle = r.shade; ctx.fillRect(cx + this.px * 0.05, baseY - this.px * 1.35, this.px * 0.17, this.px * 1.35);
        ctx.fillStyle = r.base; ctx.fillRect(cx - this.px * 0.3, baseY - this.px * 1.45, this.px * 0.6, this.px * 0.14);
        ctx.strokeStyle = r.shade; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - this.px * 0.14, baseY - this.px * 0.9); ctx.lineTo(cx + this.px * 0.1, baseY - this.px * 0.6); ctx.stroke();
        break;
      }
      case "boulder": {
        shadow(this.px * 0.5, this.px * 0.2);
        const pts = 7;
        for (let i = 0; i < pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          const rr = this.px * (0.34 + rng() * 0.12);
          const x = cx + Math.cos(a) * rr, y = baseY - this.px * 0.35 + Math.sin(a) * rr * 0.8;
          blob(x, y, rr * 0.8, i % 2 ? r.base : r.shade);
        }
        blob(cx - this.px * 0.16, baseY - this.px * 0.62, this.px * 0.16, "#ffffff", 0.13);
        break;
      }
      default: { // pebble
        shadow(this.px * 0.24, this.px * 0.1, 0.2);
        for (let i = 0; i < 3; i++) {
          const x = cx + (rng() - 0.5) * this.px * 0.4, y = baseY - this.px * 0.06 + (rng() - 0.5) * this.px * 0.12;
          blob(x, y, this.px * (0.13 + rng() * 0.09), i === 0 ? r.base : r.shade);
        }
        break;
      }
    }
    return { canvas: c, ax: cx, ay: baseY, w: W, h: H };
  }

  /** เลือก variant ที่เสถียรตามพิกัด (deterministic) */
  variantAt(tx, ty, seed, frames = 1) {
    const v = Math.floor(hash2(tx, ty, seed + 4242) * VARIANTS);
    if (frames <= 1) return { variant: v, frame: 0 };
    // tile เคลื่อนไหว (น้ำ) — เปลี่ยน frame ตามเวลา
    const f = Math.floor((performance.now() / 420 + hash2(tx, ty, seed + 77) * 4) % frames);
    return { variant: v, frame: f };
  }

  static TILE_ORDER = TILE_ORDER;
}
