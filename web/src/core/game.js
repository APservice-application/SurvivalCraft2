// web/src/core/game.js — GAME CORE (Spec ข้อ 37, 38, 42, 49)
// Engine ทำ: render/input/loop  •  Game ทำ: world rules/survival/เวลา/อากาศ
import { WorldGen } from "../world/worldgen.js";
import { ChunkManager } from "../world/chunks.js";
import { Player } from "../player/player.js";
import { GameTime } from "../systems/time.js";
import { Weather } from "../systems/weather.js";
import { Camera, Renderer } from "../render/renderer.js";
import { TileTextureCache } from "../render/tiles.js";
import { SaveSystem } from "./save.js";

// ★ หน่วย zoom = พิกเซลบนจอ ต่อ 1 tile (16px ต้นฉบับ × 2 = สไปรต์ 32px → 34px บนจอ ≈ ตัวละครสูง 1.25 tile)
export const QUALITY = {
  low: { label: "ต่ำ", loadRadius: 2, keepRadius: 3, lighting: false, weatherParticles: 0.5, minZoom: 16, maxZoom: 40, dpr: 1 },
  medium: { label: "กลาง", loadRadius: 3, keepRadius: 5, lighting: true, weatherParticles: 1, minZoom: 18, maxZoom: 48, dpr: 1 },
  high: { label: "สูง", loadRadius: 4, keepRadius: 6, lighting: true, weatherParticles: 1, minZoom: 20, maxZoom: 58, dpr: Math.min(2, window.devicePixelRatio || 1) },
};

export class Game {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.data = data;
    this.settings = { quality: "high", showDebug: false, autoSave: true, sound: true };
    this.seed = data.world.world.defaultSeed;
    this.playSeconds = 0;
    this.frame = 0;
    this.fps = 60;
    this.paused = false;
    this.exploredChunks = new Set();
    this.lights = [];
    this.currentBiome = "grassland";
    this.autoSaveT = 0;
    this._fpsSamples = [];
    this._autoTuned = false;
    this.inventory = { slots: data.starterItems || [] };  // stub — PHASE 4 จะแทนที่ด้วยระบบจริง
    this.onEvent = null;
  }

  // ── เริ่มโลกใหม่จาก seed (deterministic) ──
  newWorld(seed = this.seed) {
    this.seed = seed >>> 0;
    const cfg = this.data.world;
    this.gen = new WorldGen(cfg, this.data.tiles, this.data.biomes, this.seed);
    this.chunks = new ChunkManager(this.gen, cfg);
    this.tex = new TileTextureCache(this.data.tiles, 2);
    this.renderer = new Renderer(this.canvas, this.data.tiles, this.gen, this.tex, cfg);
    this.camera = new Camera();
    this.time = new GameTime(this.data.world);
    this.weather = new Weather(cfg, this.data.biomes, this.seed);
    this.spawnPoint = this.gen.findSpawn(0, 0);
    this.player = new Player(this.spawnPoint.x, this.spawnPoint.y);
    this.currentBiome = this.spawnPoint.biome;
    this.camera.x = this.player.x; this.camera.y = this.player.y;
    this.playSeconds = 0;
    this.exploredChunks.clear();
    this.applyQuality(this.settings.quality, true);
    // ★ ต้อง resize กล้อง/เรนเดอร์เรอร์ทุกครั้งที่สร้างโลกใหม่ ไม่งั้น viewport = 0 → จอดำ
    this.camera.resize(window.innerWidth, window.innerHeight);
    this.renderer.resize(window.innerWidth, window.innerHeight, (QUALITY[this.settings.quality] || QUALITY.high).dpr);
    this.camera.x = this.player.x; this.camera.y = this.player.y;
    // โหลด chunk รอบจุดเกิดทันที เพื่อไม่ให้เห็นพื้นว่างตอนเริ่ม
    for (let i = 0; i < 40; i++) this.chunks.update(this.player.x, this.player.y, 120);
    this._updateBiome();
    return this;
  }

  /** โหลดจาก save — world สร้างใหม่จาก seed แล้วใส่ state กลับ (Spec ข้อ 35) */
  loadFrom(data) {
    this.newWorld(data.seed);
    this.player.load(data.player);
    this.time.load(data.time);
    this.weather.load(data.weather);
    this.camera.load(data.camera);
    this.playSeconds = data.stats?.playSeconds || 0;
    if (data.world?.chunkMods) for (const [k, v] of Object.entries(data.world.chunkMods)) this.chunks.dirtyModifications.set(k, v);
    if (data.world?.spawn) this.spawnPoint = data.world.spawn;
    if (data.world?.explored) this.exploredChunks = new Set(data.world.explored);
    if (data.settings) this.settings = { ...this.settings, ...data.settings };
    this.camera.x = this.player.x; this.camera.y = this.player.y;
    return this;
  }

  applyQuality(level, force = false) {
    const q = QUALITY[level] || QUALITY.high;
    if (!force && this.settings.quality === level) return;
    this.settings.quality = QUALITY[level] ? level : "high";
    this.chunks.loadRadius = q.loadRadius + 1;   // เก็บ margin ให้ streaming มีเวลา gen ล่วงหน้า
    this.chunks.keepRadius = Math.max(this.chunks.keepRadius, q.keepRadius + 1);
    this.renderer.settings.showLighting = q.lighting;
    this.camera.minZoom = q.minZoom;
    this.camera.maxZoom = q.maxZoom;
    this.camera.zoom = Math.max(q.minZoom, Math.min(q.maxZoom, this.camera.zoom));
    this.renderer.resize(this.camera.viewW || window.innerWidth, this.camera.viewH || window.innerHeight, q.dpr);
    return q;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = QUALITY[this.settings.quality] || QUALITY.high;
    this.camera.resize(w, h);
    this.renderer.resize(w, h, q.dpr);
  }

  // ── main update ────────────────────────────────────────────────
  update(dt) {
    if (this.paused) return;
    this.frame++;
    this.playSeconds += dt;

    this.input.update();

    // 1) ผู้เล่น
    const inWater = this.chunks.isLiquidAt(Math.floor(this.player.x), Math.floor(this.player.y));
    const st = this.player.stats;
    // ตัวคูณความเร็วจาก tile + สภาพอากาศ (Spec ข้อ 13)
    this.player.update(dt * (this.weather.movePenalty || 1), this.input, this.chunks);

    // 2) กล้อง
    const lookX = this.player.vx * (this.player.running ? 1 : 0.6);
    const lookY = this.player.vy * (this.player.running ? 1 : 0.6);
    this.camera.follow(this.player.x, this.player.y, lookX, lookY, dt);

    // 3) โลก: chunk streaming ตามตำแหน่งกล้อง (มากกว่าผู้เล่นเล็กน้อยเพื่อกันภาพว่าง)
    this.chunks.update(this.camera.x, this.camera.y, 3.2);
    if (this.frame % 30 === 0) {
      const ck = Math.floor(this.player.x / this.gen.size) + "," + Math.floor(this.player.y / this.gen.size);
      if (!this.exploredChunks.has(ck)) { this.exploredChunks.add(ck); if (this.exploredChunks.size > 5000) this.exploredChunks.clear(); }
    }

    // 4) เวลา + อากาศ
    this.time.update(dt);
    this._updateBiome();
    this.weather.update(dt, { biome: this.currentBiome, hour: this.time.hour, day: this.time.day });

    // 5) survival stats (Spec ข้อ 11) — ระบบเชื่อมโยงกันหมด
    const biomeTemp = (this.gen.biomesDb.biomes[this.currentBiome] || {}).temperature ?? 22;
    const nearFire = this.lights.some((l) => l.fire && Math.hypot(l.x - this.player.x, l.y - this.player.y) < 4);
    st.update(dt, {
      moving: this.player.moving, sprinting: this.player.running,
      inWater, night: this.time.isNight, biomeTemp: biomeTemp + (this.weather.current.tempDelta || 0),
      rain: this.weather.isRain, snow: this.weather.isSnow, nearFire,
    });
    if (st.dead && !this._deadShown) { this._deadShown = true; this.onEvent && this.onEvent("death", st); }
    if (!st.dead) this._deadShown = false;

    // 6) แหล่งแสงในมุมมอง (ผลึกเวท/กองไฟ) — เก็บเป็นช่วง ๆ เพื่อประหยัด
    if (this.frame % 12 === 0) this._collectLights();

    // 7) autosave
    this.autoSaveT += dt;
    if (this.settings.autoSave && this.autoSaveT > 30) {
      this.autoSaveT = 0;
      if (SaveSystem.save(this, "auto")) this.onEvent && this.onEvent("autosave");
    }
  }

  _updateBiome() {
    const b = this.gen.biomeAt(Math.floor(this.player.x), Math.floor(this.player.y));
    if (b !== this.currentBiome) {
      this.currentBiome = b;
      this.onEvent && this.onEvent("biome", this.gen.biomesDb.biomes[b]);
    }
  }

  _collectLights() {
    const cam = this.camera;
    const half = Math.max(cam.viewW, cam.viewH) / cam.zoom * 0.7;
    const list = this.chunks.propsInRect(cam.x - half, cam.y - half, cam.x + half, cam.y + half);
    const out = [];
    for (const p of list) {
      const def = this.data.tiles.props[p.type];
      if (def && (def.glow || def.light)) out.push({ x: p.x, y: p.y, radius: def.light || 3.2, fire: !!def.fire });
      if (out.length > 26) break;
    }
    this.lights = out;
  }

  render() {
    this.renderer.draw(this);
  }

  respawn() {
    this.player.x = this.spawnPoint.x;
    this.player.y = this.spawnPoint.y;
    const st = this.player.stats;
    st.hp = st.maxHp * 0.6; st.hunger = Math.max(st.hunger, 45); st.thirst = Math.max(st.thirst, 45);
    st.stamina = st.maxStamina * 0.6; st.dead = false; st.effects = [];
    this.camera.x = this.player.x; this.camera.y = this.player.y;
    this.paused = false;
  }

  /** ตรวจคุณภาพภาพอัตโนมัติถ้า FPS ตก (Spec ข้อ 42: mobile-first) */
  autoTune(fps) {
    this._fpsSamples.push(fps);
    if (this._fpsSamples.length > 90) this._fpsSamples.shift();
    if (this._fpsSamples.length < 60 || this._autoTuned) return;
    const avg = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
    if (avg < 42) {
      this._autoTuned = true;
      const order = ["high", "medium", "low"];
      const next = order[Math.min(order.indexOf(this.settings.quality) + 1, order.length - 1)];
      if (next !== this.settings.quality) {
        this.applyQuality(next, true);
        this.onEvent && this.onEvent("autotune", next);
      }
    }
  }

  save(slot = "manual") { return SaveSystem.save(this, slot); }
  load(slot = "manual") { const d = SaveSystem.load(slot); return d ? this.loadFrom(d) : null; }
}
