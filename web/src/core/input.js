// web/src/core/input.js — MOBILE CONTROL (Spec ข้อ 32) + คีย์บอร์ดสำหรับเดสก์ท็อปเทสต์
// Virtual Joystick ลอย (แตะตรงไหนก็ได้ครึ่งซ้าย) + ปุ่มฝั่งขวา + pinch zoom
export class Input {
  constructor(root, opts = {}) {
    this.root = root;
    this.axis = { x: 0, y: 0 };
    this.sprint = false;
    this.sprintToggle = false;
    this.pressed = new Set();
    this.keys = new Set();
    this.joy = null;             // {id, ox, oy, x, y, dx, dy}
    this.buttons = {};
    this.onZoom = opts.onZoom || null;
    this.touches = new Map();
    this.pinch = null;
    this.enabled = true;
    this._build();
    this._bindKeyboard();
  }

  _el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  _build() {
    const wrap = this._el("div", "touch-layer", this.root);

    // โซนครึ่งซ้าย = จอยสติ๊ก (โผล่ตรงที่แตะ)
    this.joyZone = this._el("div", "joy-zone", wrap);
    this.joyBase = this._el("div", "joy-base hidden", wrap);
    this.joyKnob = this._el("div", "joy-knob", this.joyBase);

    // ปุ่มฝั่งขวา
    const pad = this._el("div", "action-pad", wrap);
    const mk = (id, label, cls = "") => {
      const b = this._el("button", "btn-round " + cls, pad);
      b.innerHTML = label;
      b.dataset.action = id;
      this.buttons[id] = b;
      return b;
    };
    this.actionBtns = [
      mk("attack", '<span class="b-ico">⚔</span><span class="b-lbl">โจมตี</span>', "b-attack"),
      mk("interact", '<span class="b-ico">✋</span><span class="b-lbl">ใช้</span>', "b-use"),
      mk("dodge", '<span class="b-ico">↯</span><span class="b-lbl">หลบ</span>', "b-dodge"),
      mk("sprint", '<span class="b-ico">»</span><span class="b-lbl">วิ่ง</span>', "b-sprint"),
    ];
    const sys = this._el("div", "sys-pad", wrap);
    const mkSys = (id, label) => { const b = this._el("button", "btn-sys", sys); b.innerHTML = label; b.dataset.action = id; this.buttons[id] = b; return b; };
    mkSys("inventory", "🎒");
    mkSys("map", "🗺");
    mkSys("pause", "⏸");
    mkSys("cast", "✨");

    this._bindPointers();
  }

  _bindPointers() {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    const localPos = (e) => {
      const r = this.root.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e) => {
      if (!this.enabled) return;
      const p = localPos(e);
      this.touches.set(e.pointerId, p);
      const isUIZone = e.target.closest && e.target.closest(".action-pad, .sys-pad, .hud-btn, .panel");
      if (isUIZone) return;
      if (this.touches.size === 2) { this._startPinch(); return; }
      if (this.touches.size >= 2) return;
      stop(e);
      this.joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y, dx: 0, dy: 0 };
      this.joyBase.style.left = p.x + "px";
      this.joyBase.style.top = p.y + "px";
      this.joyBase.classList.remove("hidden");
      this.root.setPointerCapture && this.root.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!this.enabled) return;
      const p = localPos(e);
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, p);
      if (this.pinch && this.touches.size >= 2) { this._updatePinch(); return; }
      if (this.joy && this.joy.id === e.pointerId) {
        stop(e);
        const maxR = 62;
        let dx = p.x - this.joy.ox, dy = p.y - this.joy.oy;
        const len = Math.hypot(dx, dy);
        if (len > maxR) { dx = (dx / len) * maxR; dy = (dy / len) * maxR; }
        this.joy.dx = dx; this.joy.dy = dy;
        this.axis.x = dx / maxR; this.axis.y = dy / maxR;
        this.joyKnob.style.transform = "translate(" + dx + "px," + dy + "px)";
      }
    };
    const onUp = (e) => {
      this.touches.delete(e.pointerId);
      if (this.pinch && this.touches.size < 2) this.pinch = null;
      if (this.joy && this.joy.id === e.pointerId) {
        this.joy = null;
        this.axis.x = 0; this.axis.y = 0;
        this.joyBase.classList.add("hidden");
        this.joyKnob.style.transform = "translate(0,0)";
      }
    };
    this.root.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // ปุ่มกด: pointerdown = กดค้าง (attack/sprint) ; click = ครั้งเดียว (ของหนึ่งจังหวะ)
    for (const [id, btn] of Object.entries(this.buttons)) {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.classList.add("pressed");
        if (id === "sprint") { this.sprintToggle = !this.sprintToggle; this.sprint = this.sprintToggle; btn.classList.toggle("active", this.sprintToggle); return; }
        if (id === "attack") { this.hold = true; this.pressed.add("attack"); return; }
        this.pressed.add(id);
      });
      btn.addEventListener("pointerup", (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.classList.remove("pressed");
        if (id === "attack") this.hold = false;
      });
      btn.addEventListener("pointerleave", () => { btn.classList.remove("pressed"); if (id === "attack") this.hold = false; });
    }
  }

  _startPinch() {
    const [a, b] = [...this.touches.values()];
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  _updatePinch() {
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (this.pinch && this.onZoom) this.onZoom(d / (this.pinch.d || d));
    this.pinch = { d };
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      const map = { " ": "dodge", f: "interact", e: "interact", q: "attack", tab: "inventory", m: "map", escape: "pause", g: "cast" };
      if (map[k]) this.pressed.add(map[k]);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => { this.keys.clear(); this.axis.x = this.axis.y = 0; });
  }

  /** อัปเดตแกนจากคีย์บอร์ด (ถ้าไม่ได้แตะจอ) */
  update() {
    let kx = 0, ky = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) kx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) kx += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) ky -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) ky += 1;
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      this.axis.x = kx / l; this.axis.y = ky / l;
    } else if (!this.joy) { this.axis.x = 0; this.axis.y = 0; }
    this.sprint = this.sprintToggle || this.keys.has("shift");
  }

  consume(action) {
    if (this.pressed.has(action)) { this.pressed.delete(action); return true; }
    return false;
  }
  isHeld(action) { return this.hold && action === "attack"; }
  setVisible(v) { this.root.querySelector(".touch-layer").style.display = v ? "" : "none"; }
}
