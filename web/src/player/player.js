// shared/rules/player.js — PLAYER SYSTEM (Spec ข้อ 10) + SURVIVAL STATS scaffold (Spec ข้อ 11)
import { clamp, lerp } from "../core/math.js";

export class PlayerStats {
  constructor() {
    this.maxHp = 100; this.hp = 100;
    this.maxStamina = 100; this.stamina = 100;
    this.maxMana = 50; this.mana = 50;
    this.hunger = 100;      // 0 = อดอยาก, 100 = อิ่ม
    this.thirst = 100;
    this.energy = 100;      // พลังงาน/ความเหนื่อยล้า
    this.temperature = 36.5;
    this.wetness = 0;       // ตัวเปียก 0..1
    this.effects = [];      // {id, level, timeLeft} — Phase 9
    this.dead = false;
  }

  /** @param dt วินาที @param ctx {inWater, night, biomeTemp, weather, sprinting, moving} */
  update(dt, ctx) {
    const t = dt / 60; // อัตราการลดต่อนาที → ต่อวินาที (ปรับสมดุลให้เล่นสบายบนมือถือ)
    // ความหิว/กระหาย (ช้าพอให้เล่นได้จริง)
    this.hunger = clamp(this.hunger - 0.28 * dt * (ctx.moving ? 1.15 : 1) * (ctx.sprinting ? 1.6 : 1), 0, 100);
    this.thirst = clamp(this.thirst - 0.36 * dt * (ctx.moving ? 1.15 : 1) * (ctx.sprinting ? 1.75 : 1), 0, 100);
    // พลังงาน/สตามินา
    if (ctx.sprinting && ctx.moving && this.stamina > 0) this.stamina = clamp(this.stamina - 22 * dt, 0, this.maxStamina);
    else this.stamina = clamp(this.stamina + (ctx.moving ? 6 : 14) * dt, 0, this.maxStamina);
    this.energy = clamp(this.energy + (ctx.sleeping ? 6 : -0.5) * dt, 0, 100);
    this.mana = clamp(this.mana + 1.4 * dt, 0, this.maxMana);

    // อุณหภูมิร่างกาย: biome + กลางคืน + เปียก + ไฟใกล้ตัว
    let target = 36.5 + clamp((ctx.biomeTemp - 22) / 12, -1.6, 1.6) * 0.9;
    if (ctx.night) target -= 0.45;
    if (ctx.rain) target -= 0.35;
    if (this.wetness > 0.4) target -= 0.7;
    if (ctx.nearFire) target += 0.9;
    this.temperature = lerp(this.temperature, target, 0.02 * dt * 6);
    this.wetness = clamp(this.wetness + (ctx.inWater ? 0.5 * dt : ctx.rain ? 0.12 * dt : -0.06 * dt), 0, 1);

    // สถานะเชื่อมโยงกัน (Spec ข้อ 11: ฝน → เปียก → หนาว → เสี่ยง Hypothermia)
    this.effects = this.effects.filter((e) => (e.timeLeft -= dt) > 0);
    const add = (id, level = 1, time = 8) => { if (!this.effects.some((e) => e.id === id)) this.effects.push({ id, level, timeLeft: time }); };
    if (this.hunger <= 0) { add("starving", 1, 5); this.hp = clamp(this.hp - 0.6 * dt, 0, this.maxHp); }
    if (this.thirst <= 0) { add("dehydrated", 1, 5); this.hp = clamp(this.hp - 0.9 * dt, 0, this.maxHp); }
    if (this.temperature < 35.0) { add("hypothermia", this.temperature < 34 ? 2 : 1, 6); this.hp = clamp(this.hp - 0.35 * dt, 0, this.maxHp); }
    if (this.temperature > 38.4) { add("heatstroke", 1, 6); this.hp = clamp(this.hp - 0.3 * dt, 0, this.maxHp); }
    if (this.wetness > 0.6) add("wet", 1, 4);
    if (this.hunger < 25) add("hungry", 1, 4);
    if (this.thirst < 25) add("thirsty", 1, 4);
    if (this.energy < 20) add("exhausted", 1, 6);

    // ฟื้นพลังชีวิตเมื่ออิ่มพอ
    if (this.hunger > 60 && this.thirst > 60 && this.hp < this.maxHp) this.hp = clamp(this.hp + 0.25 * dt, 0, this.maxHp);
    if (this.hp <= 0) this.dead = true;
  }

  eat(item) {
    if (!item || !item.food) return;
    if (item.food.hunger) this.hunger = clamp(this.hunger + item.food.hunger, 0, 100);
    if (item.food.thirst) this.thirst = clamp(this.thirst + item.food.thirst, 0, 100);
    if (item.food.heal) this.hp = clamp(this.hp + item.food.heal, 0, this.maxHp);
  }

  serialize() {
    const { maxHp, hp, maxStamina, stamina, maxMana, mana, hunger, thirst, energy, temperature, wetness, dead } = this;
    return { maxHp, hp, maxStamina, stamina, maxMana, mana, hunger, thirst, energy, temperature, wetness, dead, effects: this.effects };
  }
  load(s) { if (s) Object.assign(this, s); }
}

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.radius = 0.30;        // หน่วยเป็น tile
    this.baseSpeed = 4.4;      // tiles ต่อวินาที
    this.facing = 2;           // 0=N 1=NE 2=E ... ใช้ 8 ทิศ
    this.animT = 0;
    this.stats = new PlayerStats();
    this.sprinting = false;
    this.dodging = 0;          // เวลาที่เหลือของการกลิ้งหลบ
    this.dodgeCd = 0;
    this.dodgeDir = { x: 0, y: 0 };
    this.attackT = 0;
    this.interactTarget = null;
    this.deathReason = null;
  }

  /** เดินพร้อมชนกำแพง (แยกแกน X/Y เพื่อให้ไถลตามกำแพงได้ลื่น) */
  move(dx, dy, chunks) {
    const r = this.radius;
    const blocked = (x, y) => {
      const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
      const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        // ตรวจวงกลม-กล่อง เพื่อให้มุมไม่ทะลุ
        const cx = Math.max(tx, Math.min(x, tx + 1)), cy = Math.max(ty, Math.min(y, ty + 1));
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        if (chunks.isSolidAt(tx, ty)) return true;
      }
      return false;
    };
    if (!blocked(this.x + dx, this.y)) this.x += dx;
    if (!blocked(this.x, this.y + dy)) this.y += dy;
  }

  update(dt, input, chunks) {
    const st = this.stats;
    const ax = input.axis.x, ay = input.axis.y;
    const mag = Math.hypot(ax, ay);
    const moving = mag > 0.08;

    // การกลิ้งหลบ (dodge roll) — ใช้สตามินา มีช่วงอมตะ 0.25 วิ
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.dodging > 0) {
      this.dodging = Math.max(0, this.dodging - dt);
      const sp = 9.5;
      this.move(this.dodgeDir.x * sp * dt, this.dodgeDir.y * sp * dt, chunks);
      this.animT += dt * 4;
      return;
    }
    if (input.consume("dodge") && this.dodgeCd <= 0 && st.stamina >= 18) {
      st.stamina -= 18;
      this.dodging = 0.34; this.dodgeCd = 0.75;
      const len = mag > 0.08 ? mag : 1;
      this.dodgeDir = { x: ax / len || 0, y: ay / len || 0 };
      if (!mag) { this.dodgeDir = { x: Math.cos(this.facing * Math.PI / 4), y: Math.sin(this.facing * Math.PI / 4) }; }
      this.vx = this.vy = 0;
      return;
    }

    this.sprinting = input.sprint && moving && st.stamina > 2;
    const tileSpeed = chunks.speedAt(Math.floor(this.x), Math.floor(this.y));
    let speed = this.baseSpeed * tileSpeed * (this.sprinting ? 1.55 : 1);
    if (st.stamina < 5) speed *= 0.65;

    if (moving) {
      const inv = 1 / mag;
      this.vx = ax * inv; this.vy = ay * inv;
      this.animT += dt * (this.sprinting ? 11 : 7.5);
      this.facing = this._facingFrom(ax, ay);
    } else {
      this.vx = this.vy = 0;
      this.animT += dt * 1.2; // หายใจเบา ๆ ตอนยืน
    }

    this.move(this.vx * speed * dt, this.vy * speed * dt, chunks);
  }

  _facingFrom(x, y) {
    let a = Math.atan2(y, x);
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI / 4)) % 8; // 0=E,2=S,4=W,6=N
  }
  get running() { return this.sprinting && (Math.abs(this.vx) + Math.abs(this.vy)) > 0.05; }
  get moving() { return (Math.abs(this.vx) + Math.abs(this.vy)) > 0.05; }
  get invulnerable() { return this.dodging > 0; }

  serialize() { return { x: this.x, y: this.y, facing: this.facing, stats: this.stats.serialize() }; }
  load(s) { if (!s) return; this.x = s.x; this.y = s.y; this.facing = s.facing || 2; this.stats.load(s.stats); }
}
