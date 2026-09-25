// web/src/render/renderer.js — CAMERA + WORLD RENDERER (Spec ข้อ 9, 31, 42)
import { clamp, lerp, hash2 } from "../core/math.js";
import { VARIANTS, ANIM_FRAMES } from "./tiles.js";
import { hexToRgb } from "../systems/time.js";

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;         // ตำแหน่งกลางจอ (world units = tiles)
    this.targetX = 0; this.targetY = 0;
    this.zoom = 34;                 // ★ หน่วย: พิกเซลบนจอ ต่อ 1 tile (ไม่ใช่ตัวคูณ)
    this.minZoom = 20; this.maxZoom = 58;
    this.shake = 0; this.shakeT = 0;
    this.viewW = 0; this.viewH = 0;
  }
  resize(w, h) { this.viewW = w; this.viewH = h; }
  /** กล้องตามนุ่มนวล + เผื่อทิศทางการเดิน (look-ahead) แบบที่เหมาะกับมือถือ */
  follow(px, py, vx, vy, dt) {
    const lead = 0.55;
    this.targetX = px + vx * lead;
    this.targetY = py + vy * lead;
    const k = 1 - Math.pow(0.0016, dt);
    this.x = lerp(this.x, this.targetX, k);
    this.y = lerp(this.y, this.targetY, k);
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shake = 0; }
  }
  addShake(amount, time = 0.25) { this.shake = Math.max(this.shake, amount); this.shakeT = Math.max(this.shakeT, time); }
  zoomBy(f) { this.zoom = clamp(this.zoom * f, this.minZoom, this.maxZoom); }
  /** ตั้ง zoom ให้อยู่ในช่วงที่อนุญาต (กันค่าเพี้ยนหลังโหลดเซฟ/เปลี่ยนคุณภาพ) */
  setZoom(z) {
    const lo = Math.min(this.minZoom, this.maxZoom), hi = Math.max(this.minZoom, this.maxZoom);
    this.zoom = clamp(z, lo, hi);
  }
  get shakeOffset() {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * this.shake * 2, y: (Math.random() - 0.5) * this.shake * 2 };
  }
  worldToScreen(wx, wy) {
    const s = this.shakeOffset;
    return { x: (wx - this.x) * this.zoom + this.viewW / 2 + s.x, y: (wy - this.y) * this.zoom + this.viewH / 2 + s.y };
  }
  screenToWorld(sx, sy) {
    return { x: (sx - this.viewW / 2) / this.zoom + this.x, y: (sy - this.viewH / 2) / this.zoom + this.y };
  }
  serialize() { return { zoom: this.zoom }; }
  load(s) { if (s && s.zoom) this.setZoom(s.zoom); }
}

/** ตระกูลพื้นผิว — ใช้ตัดสินใจว่าจะ blend transition ระหว่าง tile หรือไม่ */
const FAMILY = {
  grass: "grass", lush_grass: "grass", forest_floor: "grass",
  dirt: "soil", farmland: "soil", mud: "soil", road: "road",
  sand: "sand", stone: "stone", rock: "stone", snow: "snow",
  deep_water: "water", water: "water", magic_ground: "magic",
};
/** สีที่ใช้ blend (อ่านจาก tiles.json อัตโนมัติ) */
function familyColor(def) { return (def.texture && def.texture.palette && def.texture.palette[0]) || (def.texture && def.texture.base) || "#808080"; }

export class Renderer {
  constructor(canvas, tilesDb, worldgen, texCache, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.db = tilesDb;
    this.gen = worldgen;
    this.tex = texCache;
    this.cfg = cfg;
    this.dpr = 1;
    this.lightLayer = document.createElement("canvas");
    this.lightCtx = this.lightLayer.getContext("2d");
    this.settings = { showProps: true, showLighting: true, showWeather: true, shadows: true };
    this.stats = { tilesDrawn: 0, propsDrawn: 0, frameMs: 0 };
    this._minimap = null;
    this._minimapT = 0;
  }

  resize(w, h, dpr = 1) {
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.lightLayer.width = Math.floor(w); this.lightLayer.height = Math.floor(h);
  }

  /** วาด 1 เฟรม: tiles → props → ผู้เล่น → แสง → อากาศ */
  draw(game) {
    const t0 = performance.now();
    const ctx = this.ctx, cam = game.camera, W = cam.viewW, H = cam.viewH;
    ctx.imageSmoothingEnabled = false;

    // ── tiles ที่มองเห็น (culled ตามกล้อง) ──
    const halfW = W / 2 / cam.zoom, halfH = H / 2 / cam.zoom;   // ครึ่งจอกี่ tile
    const x0 = Math.floor(cam.x - halfW) - 1, x1 = Math.ceil(cam.x + halfW) + 1;
    const y0 = Math.floor(cam.y - halfH) - 1, y1 = Math.ceil(cam.y + halfH) + 1;
    const tilePx = Math.ceil(cam.zoom) + 1;                       // ขนาด tile บนจอ (px)
    const spriteScale = cam.zoom / this.tex.px;                   // ตัวคูณจากสไปรต์ 32px → จอ
    const S = this.gen.size;
    let tiles = 0;

    ctx.fillStyle = "#0a0f18";
    ctx.fillRect(0, 0, W, H);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const chunk = game.chunks.get(Math.floor(tx / S), Math.floor(ty / S));
        let tileId, def, liquid = false;
        if (chunk) {
          const lx = tx - chunk.cx * S, ly = ty - chunk.cy * S;
          tileId = this.gen.tileFromIndex(chunk.tiles[ly * S + lx]);
        } else {
          tileId = this.gen.tileAt(tx, ty);
        }
        def = this.db.tiles[tileId] || this.db.tiles.grass;
        liquid = !!def.liquid;
        const frames = liquid ? ANIM_FRAMES : 1;
        const { variant, frame } = this.tex.variantAt(tx, ty, this.gen.seed, frames);
        const sprite = this.tex.get(tileId, variant, frame);
        const s = cam.worldToScreen(tx, ty);
        const px0 = Math.floor(s.x), py0 = Math.floor(s.y);
        ctx.drawImage(sprite, px0, py0, tilePx, tilePx);
        tiles++;
        // ── transition tile อัตโนมัติ: เกลี่ยสีขอบเมื่อเจอพื้นต่างตระกูล (Spec ข้อ 8) ──
        if (!def.liquid) this._blendEdges(ctx, chunk, S, tx, ty, px0, py0, tilePx, tileId, def);

        // ขอบชายน้ำ/โขดหิน: เสริม silhouette ไม่ให้โลกดูเป็นตาราง (Spec ข้อ 8 edge tile)
        if (liquid && this.settings.showProps) {
          const above = this.gen.tileFromIndex(chunk ? chunk.tiles[Math.max(0, ty - chunk.cy * S - 1) * S + (tx - chunk.cx * S)] : 0);
          const aboveDef = this.db.tiles[above] || {};
          if (!aboveDef.liquid) {
            ctx.globalAlpha = 0.30; ctx.fillStyle = "#cfe9ff";
            ctx.fillRect(Math.floor(s.x), Math.floor(s.y), tilePx, 2);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // ── props (ต้นไม้/หิน/ดอกไม้) เรียงตามแกน Y เพื่อให้ depth ถูกต้อง ──
    let props = 0;
    if (this.settings.showProps) {
      const list = game.chunks.propsInRect(x0 - 2, y0 - 3, x1 + 2, y1 + 2);
      list.sort((a, b) => a.y - b.y);
      for (const p of list) {
        const spr = this.tex.getProp(p.type, Math.floor(p.v % VARIANTS));
        if (!spr) continue;
        const sx = (p.x - cam.x) * cam.zoom + W / 2;
        const sy = (p.y - cam.y) * cam.zoom + H / 2;
        const drawW = spr.w * spriteScale * (p.s || 1);
        const drawH = spr.h * spriteScale * (p.s || 1);
        const ax = (spr.ax / spr.w) * drawW;
        const ay = (spr.ay / spr.h) * drawH;
        ctx.save();
        if (p.flip) { ctx.translate(Math.floor(sx), Math.floor(sy)); ctx.scale(-1, 1); ctx.drawImage(spr.canvas, -ax, -ay, drawW, drawH); }
        else ctx.drawImage(spr.canvas, Math.floor(sx - ax), Math.floor(sy - ay), drawW, drawH);
        ctx.restore();
        props++;
      }
    }
    this.stats.tilesDrawn = tiles;
    this.stats.propsDrawn = props;

    // ── ผู้เล่น ──
    this.drawPlayer(ctx, game, cam);

    // ── แสง/บรรยากาศกลางวัน–กลางคืน + แหล่งกำเนิดแสง ──
    if (this.settings.showLighting) this.drawLighting(game, cam);

    // ── สภาพอากาศ ──
    if (this.settings.showWeather && game.weather && game.weather.visual !== "none") this.drawWeather(game, cam);

    // ── Vignette บาง ๆ ให้ภาพดูมีมิติ ──
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    this.stats.frameMs = performance.now() - t0;
  }

  drawPlayer(ctx, game, cam) {
    const p = game.player;
    const U = cam.zoom;                                  // px ต่อ 1 tile
    const scale = U / 32;                                // ปรับตามขนาด tile พื้นฐาน (16px × scale 2)
    const s = cam.worldToScreen(p.x, p.y);
    const bob = p.running ? Math.sin(p.animT * 2) * 2.2 * scale : Math.sin(p.animT) * 0.7;
    const size = U * 1.25;                               // ความสูงตัวละคร ~1.25 tile
    const x = s.x, y = s.y;

    ctx.save();
    // เงา
    ctx.globalAlpha = 0.3; ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.ellipse(x, y + 2 * scale, size * 0.42, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (p.dodging > 0) ctx.globalAlpha = 0.65 + Math.sin(p.dodging * 40) * 0.2;

    const flip = p.facing === 3 || p.facing === 4 || p.facing === 5;
    const fx = flip ? -1 : 1;

    // ขา
    const legSwing = p.moving ? Math.sin(p.animT * 2) * size * 0.16 : 0;
    ctx.fillStyle = "#3b4a63";
    ctx.fillRect(x - size * 0.24 + legSwing, y - size * 0.34, size * 0.18, size * 0.34);
    ctx.fillRect(x + size * 0.06 - legSwing, y - size * 0.34, size * 0.18, size * 0.34);

    // ลำตัว (เสื้อ)
    const bodyG = ctx.createLinearGradient(x, y - size, x, y);
    bodyG.addColorStop(0, "#5f9ea0"); bodyG.addColorStop(1, "#3d7a7c");
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    (ctx.roundRect ? ctx.roundRect(x - size * 0.32, y - size * 0.9 + bob, size * 0.64, size * 0.62, size * 0.14)
      : ctx.rect(x - size * 0.32, y - size * 0.9 + bob, size * 0.64, size * 0.62));
    ctx.fill();
    // เข็มขัด
    ctx.fillStyle = "#6b4a2b"; ctx.fillRect(x - size * 0.32, y - size * 0.44 + bob, size * 0.64, size * 0.09);

    // แขน
    ctx.fillStyle = "#e8b98a";
    ctx.fillRect(x - size * 0.42 * (flip ? 1 : 1), y - size * 0.86 + bob, size * 0.12, size * 0.4);
    ctx.fillRect(x + size * 0.3, y - size * 0.86 + bob, size * 0.12, size * 0.4);

    // หัว + ผม/หมวก
    ctx.fillStyle = "#f0c79a";
    ctx.beginPath(); ctx.arc(x, y - size * 1.02 + bob, size * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a3226";
    ctx.beginPath(); ctx.arc(x, y - size * 1.06 + bob, size * 0.27, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    // ตา (หันตามทิศ)
    ctx.fillStyle = "#22303f";
    const eyeOff = size * 0.09 * fx;
    const eyeY = y - size * 1.0 + bob;
    ctx.fillRect(x + eyeOff - size * 0.09, eyeY, size * 0.06, size * 0.07);
    ctx.fillRect(x + eyeOff + size * 0.04, eyeY, size * 0.06, size * 0.07);

    // ไฮไลต์แสงด้านบน
    ctx.globalAlpha = 0.13; ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x - size * 0.1, y - size * 1.1 + bob, size * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** แสงกลางวัน–กลางคืน + คบเพลิง/กองไฟ (Phase 1: ใช้ time.light) */
  drawLighting(game, cam) {
    const ctx = this.ctx, W = cam.viewW, H = cam.viewH;
    const light = game.time.light;
    if (light > 0.985) return;
    const dark = clamp(1 - light, 0, 1) * 0.82;
    const lctx = this.lightCtx;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, W, H);
    lctx.globalCompositeOperation = "source-over";
    const rgb = hexToRgb(game.time.tint.startsWith("#") ? game.time.tint : "#0b1330");
    lctx.fillStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + dark + ")";
    lctx.fillRect(0, 0, W, H);

    // เจาะรูแสงรอบผู้เล่น (เหมือนถือตะเกียง)
    lctx.globalCompositeOperation = "destination-out";
    const p = cam.worldToScreen(game.player.x, game.player.y);
    const r = 4.8 * cam.zoom;
    const g = lctx.createRadialGradient(p.x, p.y, r * 0.12, p.x, p.y, r);
    g.addColorStop(0, "rgba(0,0,0,0.95)");
    g.addColorStop(0.45, "rgba(0,0,0,0.62)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = g; lctx.beginPath(); lctx.arc(p.x, p.y, r, 0, Math.PI * 2); lctx.fill();

    // แหล่งแสงอื่น (props glow เช่น ผลึกเวท / กองไฟ ใน Phase 7)
    for (const l of game.lights || []) {
      const s = cam.worldToScreen(l.x, l.y);
      const rr = (l.radius || 3.4) * cam.zoom;
      const gg = lctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
      gg.addColorStop(0, "rgba(0,0,0,0.9)");
      gg.addColorStop(1, "rgba(0,0,0,0)");
      lctx.fillStyle = gg; lctx.beginPath(); lctx.arc(s.x, s.y, rr, 0, Math.PI * 2); lctx.fill();
    }
    lctx.globalCompositeOperation = "source-over";

    ctx.drawImage(this.lightLayer, 0, 0);
    // เงาม่วง/ส้มอ่อน ๆ ตามเวลา (บรรยากาศ)
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.16 * dark + 0.05;
    ctx.fillStyle = game.time.tint;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /** ฝน/หิมะ/หมอก — ใช้ particle เบา ๆ (Phase 13 จะย้ายเป็นระบบเต็ม) */
  drawWeather(game, cam) {
    const ctx = this.ctx, W = cam.viewW, H = cam.viewH;
    const w = game.weather;
    const t = performance.now() / 1000;
    if (w.visual === "fog") {
      ctx.globalAlpha = 0.32; ctx.fillStyle = "#c8d8e8";
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < 6; i++) {
        const y = ((t * 12 + i * 90) % (H + 160)) - 80;
        ctx.beginPath(); ctx.ellipse(W / 2, y, W * 0.7, 40, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    const snow = w.visual === "snow";
    const heavy = w.visual === "heavy_rain" || w.visual === "storm";
    const count = snow ? 90 : (heavy ? 260 : 130);
    ctx.strokeStyle = snow ? "rgba(255,255,255,0.85)" : "rgba(180,215,255,0.55)";
    ctx.fillStyle = snow ? "rgba(255,255,255,0.85)" : ctx.strokeStyle;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < count; i++) {
      const seedX = (i * 97.3) % W;
      const speed = snow ? 40 : (heavy ? 900 : 620);
      const x = (seedX + (snow ? Math.sin(t * 0.8 + i) * 18 : 0) + (heavy ? 60 : 20) * t) % W;
      const y = ((i * 53.7 + t * speed) % (H + 40)) - 20;
      if (snow) { ctx.beginPath(); ctx.arc(x, y, 1.6 + (i % 3) * 0.5, 0, Math.PI * 2); ctx.fill(); }
      else {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.4, y + (heavy ? 16 : 11)); ctx.stroke();
      }
    }
    if (w.visual === "storm") {
      if (Math.random() < 0.006) game.camera.addShake(6, 0.15);
      ctx.fillStyle = "rgba(200,220,255," + (Math.random() < 0.03 ? 0.22 : 0) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** transition tile อัตโนมัติ: เกลี่ยเม็ดสีของ tile เพื่อนบ้านตามขอบ (Spec ข้อ 8) */
  _blendEdges(ctx, chunk, S, tx, ty, px0, py0, tilePx, tileId) {
    const fam = FAMILY[tileId] || "other";
    if (fam === "water" || fam === "magic" || fam === "road") return;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const band = Math.max(2, tilePx * 0.3);
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = dirs[d];
      const nx = tx + dx, ny = ty + dy;
      let nId;
      if (chunk && nx >= chunk.cx * S && nx < (chunk.cx + 1) * S && ny >= chunk.cy * S && ny < (chunk.cy + 1) * S) {
        nId = this.gen.tileFromIndex(chunk.tiles[(ny - chunk.cy * S) * S + (nx - chunk.cx * S)]);
      } else nId = this.gen.tileAt(nx, ny);
      const nDef = this.db.tiles[nId];
      if (!nDef || nDef.liquid) continue;
      const nFam = FAMILY[nId] || "other";
      if (nFam === fam) continue;
      if (nFam === "water" || nFam === "magic") continue;
      const col = familyColor(nDef);
      const rand = (i, k) => {
        let h = Math.imul(tx * 73856093 ^ ty * 19349663 ^ (i * 83492791) ^ (k * 2654435761), 2654435761);
        h = (h ^ (h >>> 13)) >>> 0;
        return h / 4294967296;
      };
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = col;
      for (let i = 0; i < 5; i++) {
        const r = 1 + rand(i, d) * (tilePx * 0.11);
        const along = rand(i, d + 9) * tilePx;
        const into = rand(i, d + 21) * band;
        let cx2 = px0 + along, cy2 = py0 + into;
        if (dx === 1) { cx2 = px0 + tilePx - into; cy2 = py0 + along; }
        else if (dx === -1) { cx2 = px0 + into; cy2 = py0 + along; }
        else if (dy === 1) { cx2 = px0 + along; cy2 = py0 + tilePx - into; }
        ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** minimap: สี biome + จุดผู้เล่น (อัปเดตเป็นช่วง ๆ เพื่อประหยัด) */
  drawMinimap(canvas, game, radius = 48, scale = 2) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const px = game.player.x, py = game.player.y;
    const t = performance.now();
    if (!this._minimap || t - this._minimapT > 700 || Math.abs(this._minimapX - px) > 6 || Math.abs(this._minimapY - py) > 6) {
      const mc = document.createElement("canvas");
      mc.width = W; mc.height = H;
      const mctx = mc.getContext("2d");
      const step = (radius * 2) / W;
      for (let j = 0; j < H; j += 1) {
        for (let i = 0; i < W; i += 1) {
          const wx = Math.floor(px - radius + i * step) * 1;
          const wy = Math.floor(py - radius + j * step) * 1;
          const b = this.gen.biomeAt(wx, wy);
          mctx.fillStyle = this.gen.biomesDb.biomes[b].color || "#335533";
          mctx.fillRect(i, j, 1, 1);
        }
      }
      this._minimap = mc; this._minimapT = t; this._minimapX = px; this._minimapY = py;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this._minimap, 0, 0);
    // ผู้เล่น
    const cx = W / 2, cy = H / 2;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e0392b"; ctx.beginPath(); ctx.arc(cx, cy, 2.1, 0, Math.PI * 2); ctx.fill();
    return { cx, cy };
  }
}
