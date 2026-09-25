// web/src/ui/hud.js — HUD (Spec ข้อ 33) : HP/Hunger/Thirst/Stamina/Mana, เวลา, อากาศ, biome, minimap, hotbar
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      time: $("txt-time"), day: $("txt-day"), weather: $("txt-weather"), biome: $("txt-biome"), temp: $("txt-temp"),
      hp: $("bar-hp") || null, hunger: $("bar-hunger"), thirst: $("bar-thirst"), stamina: $("bar-stamina"), mana: $("bar-mana"),
      valHp: $("val-hp"), valHunger: $("val-hunger"), valThirst: $("val-thirst"), valStamina: $("val-stamina"), valMana: $("val-mana"),
      effects: $("effects"), minimap: $("minimap"), coord: $("txt-coord"), mmbiome: $("txt-mmbiome"),
      hotbar: $("hotbar"), hint: $("hint"), toasts: $("toasts"), debug: $("debug"),
      chipWeather: $("chip-weather"), chipBiome: $("chip-biome"),
      panelInv: $("panel-inventory"), invGrid: $("inv-grid"),
      panelMap: $("panel-map"), bigmap: $("bigmap"),
      panelPause: $("panel-pause"), pauseInfo: $("pause-info"), txtQuality: $("txt-quality"),
      panelDeath: $("panel-death"), deathInfo: $("death-info"),
    };
    this.hotbar = [
      { id: "hand", icon: "✋", label: "มือเปล่า" },
      { id: "axe", icon: "🪓", label: "ขวาน" },
      { id: "pickaxe", icon: "⛏", label: "อีเต้อ" },
      { id: "sword", icon: "🗡", label: "ดาบ" },
      { id: "torch", icon: "🔥", label: "คบเพลิง" },
      { id: "build", icon: "🧱", label: "สร้าง" },
    ];
    this.activeSlot = 0;
    this._hintT = 0;
    this._buildHotbar();
    this._buildInventoryPlaceholder();
  }

  _buildHotbar() {
    this.el.hotbar.innerHTML = "";
    this.hotbar.forEach((s, i) => {
      const d = document.createElement("div");
      d.className = "slot" + (i === 0 ? " active" : "");
      d.innerHTML = '<span class="num">' + (i + 1) + '</span>' + s.icon;
      d.title = s.label;
      d.addEventListener("pointerdown", (e) => { e.stopPropagation(); this.setActiveSlot(i); });
      this.el.hotbar.appendChild(d);
    });
  }

  setActiveSlot(i) {
    this.activeSlot = i;
    [...this.el.hotbar.children].forEach((c, n) => c.classList.toggle("active", n === i));
    this.hint("เลือก: " + this.hotbar[i].label);
  }

  _buildInventoryPlaceholder() {
    const N = 24;
    this.el.invGrid.innerHTML = "";
    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.className = "inv-slot";
      this.el.invGrid.appendChild(d);
    }
  }

  toast(msg, ms = 2200) {
    const d = document.createElement("div");
    d.className = "toast"; d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => { d.style.transition = "opacity .3s"; d.style.opacity = "0"; setTimeout(() => d.remove(), 320); }, ms);
  }

  hint(text, ms = 1400) {
    if (text) this.el.hint.textContent = text;
    this.el.hint.classList.add("show");
    this._hintT = performance.now() + ms;
  }

  showPanel(which, show = true) {
    const map = { inventory: this.el.panelInv, map: this.el.panelMap, pause: this.el.panelPause, death: this.el.panelDeath };
    const p = map[which]; if (!p) return;
    p.classList.toggle("hidden", !show);
    if (which === "inventory" && show) this._fillInventory();
  }
  togglePanel(which) {
    const map = { inventory: this.el.panelInv, map: this.el.panelMap, pause: this.el.panelPause, death: this.el.panelDeath };
    const p = map[which]; if (!p) return;
    this.showPanel(which, p.classList.contains("hidden"));
  }
  anyPanelOpen() {
    return ["panel-inventory", "panel-map", "panel-pause", "panel-death"].some((id) => !$(id).classList.contains("hidden"));
  }

  _fillInventory() {
    const inv = this.game.inventory;
    const slots = this.el.invGrid.children;
    const list = inv ? inv.slots : [];
    for (let i = 0; i < slots.length; i++) {
      const it = list[i];
      slots[i].innerHTML = it ? (it.icon || "❔") + '<span class="cnt">' + it.count + "</span>" : "";
      slots[i].title = it ? it.name : "";
    }
  }

  /** เรียกทุกเฟรม (แต่ throttled งานหนักไว้) */
  update(dt) {
    const g = this.game, p = g.player, st = p.stats;
    const now = performance.now();

    this.el.time.textContent = g.time.clockText();
    this.el.day.textContent = "วันที่ " + g.time.day;
    this.el.weather.textContent = g.weather.name;
    const b = g.gen.biomesDb.biomes[g.currentBiome] || {};
    this.el.biome.textContent = b.name || "-";
    this.el.mmbiome.textContent = (b.name || "-") + " • " + g.time.phase.name;
    this.el.temp.textContent = st.temperature.toFixed(1) + "°C";
    this.el.coord.textContent = p.x.toFixed(0) + ", " + p.y.toFixed(0);

    // ไอคอนอากาศ
    const icons = { clear: "☀", cloudy: "☁", rain: "🌧", heavy_rain: "🌧", storm: "⛈", fog: "🌫", snow: "❄", heat: "🔥", wind: "🌬" };
    this.el.chipWeather.querySelector(".ico").textContent = icons[g.weather.current.id] || "☀";

    const setBar = (el, val, max) => { if (el) el.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + "%"; };
    setBar(this.el.hp, st.hp, st.maxHp);
    setBar(this.el.hunger, st.hunger, 100);
    setBar(this.el.thirst, st.thirst, 100);
    setBar(this.el.stamina, st.stamina, st.maxStamina);
    setBar(this.el.mana, st.mana, st.maxMana);
    if (this.el.valHp) this.el.valHp.textContent = Math.ceil(st.hp);
    this.el.valHunger.textContent = Math.ceil(st.hunger);
    this.el.valThirst.textContent = Math.ceil(st.thirst);
    this.el.valStamina.textContent = Math.ceil(st.stamina);
    this.el.valMana.textContent = Math.ceil(st.mana);

    // สถานะผิดปกติ
    if (g.frame % 12 === 0) {
      const names = { starving: "อดอยาก", dehydrated: "ขาดน้ำ", hypothermia: "หนาวเกิน", heatstroke: "ร้อนเกิน", wet: "ตัวเปียก", hungry: "หิว", thirsty: "กระหาย", exhausted: "อ่อนเพลีย", poisoned: "พิษ", bleeding: "เลือดออก", burning: "ไฟไหม้", frozen: "แข็ง", diseased: "ป่วย" };
      this.el.effects.innerHTML = st.effects.map((e) => '<span class="eff">' + (names[e.id] || e.id) + (e.level > 1 ? " " + e.level : "") + "</span>").join("");
    }

    if (this._hintT && now > this._hintT) { this.el.hint.classList.remove("show"); this._hintT = 0; }

    // minimap (ทุก ~6 เฟรม)
    if (g.frame % 6 === 0) g.renderer.drawMinimap(this.el.minimap, g, 46, 2);

    // debug
    if (g.settings.showDebug) {
      const f = g.fps;
      this.el.debug.classList.remove("hidden");
      this.el.debug.innerHTML =
        "FPS " + f.toFixed(0) + " • เฟรม " + g.renderer.stats.frameMs.toFixed(1) + "ms<br>" +
        "tile " + g.renderer.stats.tilesDrawn + " • prop " + g.renderer.stats.propsDrawn + "<br>" +
        "chunk " + g.chunks.stats.loaded + " (คิว " + g.chunks.stats.queued + ", gen " + g.chunks.stats.generated + ")<br>" +
        "seed " + g.seed + " • " + g.time.phase.name + "<br>" +
        "คุณภาพ: " + g.settings.quality + " • zoom " + g.camera.zoom.toFixed(2);
    } else {
      this.el.debug.classList.add("hidden");
    }
  }
}
