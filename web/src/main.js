// web/src/main.js — BOOTSTRAP: รวมทุกระบบเข้าด้วยกันแล้วเริ่มเกม
import { GAME_DATA, validateData } from "./core/data.js";
import { Game, QUALITY } from "./core/game.js";
import { Input } from "./core/input.js";
import { HUD } from "./ui/hud.js";
import { SaveSystem } from "./core/save.js";

const $ = (id) => document.getElementById(id);
const setLoading = (pct, text) => {
  $("lbar-fill").style.width = pct + "%";
  if (text) $("lstep").textContent = text;
};

async function boot() {
  setLoading(12, "ตรวจสอบข้อมูลเกม…");
  const issues = validateData(GAME_DATA);
  if (issues.length) {
    console.warn("[data] พบปัญหาข้อมูล:", issues);
    $("lstep").innerHTML = "พบปัญหาข้อมูล <br>" + issues.slice(0, 3).join("<br>");
    await new Promise((r) => setTimeout(r, 2600));
  }

  const canvas = $("game");
  const game = new Game(canvas, GAME_DATA);
  window.SC2 = game;               // debug console
  setLoading(38, "สร้างโลกจาก seed (deterministic)…");

  // เริ่มโลก: ถ้ามีเซฟให้ถามโหลด / ถ้าไม่มีก็เริ่มใหม่
  const info = SaveSystem.info("manual");
  const auto = SaveSystem.info("auto");
  await new Promise((r) => requestAnimationFrame(r));
  setLoading(58, "สร้างภูมิประเทศ + biome…");
  if (auto) {
    try { game.loadFrom(SaveSystem.load("auto")); } catch (e) { console.warn("โหลด autosave ไม่ได้", e); game.newWorld(); }
  } else {
    game.newWorld();
  }
  setLoading(76, "เตรียม HUD + ปุ่มควบคุมมือถือ…");

  const ui = $("ui");
  const input = new Input(ui, {
    onZoom: (f) => { game.camera.zoomBy(Math.pow(f, 0.55)); },
  });
  game.input = input;
  const hud = new HUD(game);
  game.hud = hud;

  // ── ปุ่ม / แผง UI ──
  for (const btn of document.querySelectorAll("[data-close]")) {
    btn.addEventListener("click", () => { hud.showPanel(btn.dataset.close, false); game.paused = false; });
  }
  $("btn-resume").onclick = () => { hud.showPanel("pause", false); game.paused = false; };
  $("btn-save").onclick = () => {
    hud.toast(game.save("manual") ? "💾 บันทึกเกมแล้ว" : "บันทึกไม่สำเร็จ (พื้นที่เต็ม)");
  };
  $("btn-load").onclick = () => {
    const d = SaveSystem.load("manual");
    if (!d) return hud.toast("ไม่พบเซฟ");
    game.loadFrom(d);
    hud.showPanel("pause", false); game.paused = false;
    hud.toast("📂 โหลดเซฟแล้ว (seed " + d.seed + ")");
  };
  $("btn-new").onclick = () => {
    const seed = (Math.random() * 4294967295) >>> 0;
    game.newWorld(seed);
    hud.showPanel("pause", false); game.paused = false;
    hud.toast("🌱 โลกใหม่ seed " + seed);
  };
  $("btn-quality").onclick = () => {
    const order = ["low", "medium", "high"];
    const next = order[(order.indexOf(game.settings.quality) + 1) % 3];
    game.applyQuality(next, true);
    $("txt-quality").textContent = QUALITY[next].label;
    hud.toast("คุณภาพภาพ: " + QUALITY[next].label);
  };
  $("btn-respawn").onclick = () => { game.respawn(); hud.showPanel("death", false); hud.toast("คุณฟื้นขึ้นที่จุดเกิด"); };
  $("btn-death-load").onclick = () => {
    const d = SaveSystem.load("manual") || SaveSystem.load("auto");
    if (!d) return hud.toast("ไม่พบเซฟ");
    game.loadFrom(d); hud.showPanel("death", false);
  };
  $("txt-quality").textContent = QUALITY[game.settings.quality].label;

  // ── keyboard shortcuts (สำหรับทดสอบบนเดสก์ท็อป) ──
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "tab") { e.preventDefault(); hud.togglePanel("inventory"); }
    if (k === "m") hud.togglePanel("map");
    if (k === "escape") { hud.togglePanel("pause"); game.paused = !game.paused; }
    if (k >= "1" && k <= "6") hud.setActiveSlot(parseInt(k, 10) - 1);
    if (k === "f3") { game.settings.showDebug = !game.settings.showDebug; }
  });

  // ── เหตุการณ์ในเกม → ข้อความ HUD ──
  let lastBiome = null;
  game.onEvent = (type, payload) => {
    if (type === "biome") {
      if (lastBiome && lastBiome !== payload.id) hud.toast("📍 " + payload.name);
      lastBiome = payload.id;
    } else if (type === "autosave") { /* เงียบ ไม่รบกวน */ }
    else if (type === "autotune") hud.toast("⚙ ปรับคุณภาพเป็น " + QUALITY[payload].label + " เพื่อความลื่นไหล");
    else if (type === "death") {
      $("death-info").textContent = "วันที่ " + game.time.day + " • ตำแหน่ง " + game.player.x.toFixed(0) + "," + game.player.y.toFixed(0);
      hud.showPanel("death", true);
      game.paused = true;
    }
  };

  // ── resize / orientation ──
  game.camera.resize(window.innerWidth, window.innerHeight);
  game.resize();
  window.addEventListener("resize", () => game.resize());
  window.addEventListener("orientationchange", () => setTimeout(() => game.resize(), 260));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { game.paused = true; SaveSystem.save(game, "auto"); }
  });

  // ── autosave ตอนปิดหน้า ──
  window.addEventListener("pagehide", () => SaveSystem.save(game, "auto"));

  setLoading(100, "พร้อมแล้ว!");
  await new Promise((r) => setTimeout(r, 260));
  $("loading").classList.add("done");

  // splash แรก: แจ้งกติกาพื้นฐาน + จุดเกิด
  const b = GAME_DATA.biomes.biomes[game.currentBiome];
  hud.toast("🌍 เกิดใน " + (b ? b.name : "ทุ่งหญ้า") + " • seed " + game.seed, 3200);
  if (info) hud.toast("มีเซฟเก่าอยู่ (วันที่ " + info.day + ") — เปิดเมนู ⏸ เพื่อโหลด", 3600);
  hud.hint("ลากครึ่งซ้ายของจอเพื่อเดิน • ปุ่มขวาคือโจมตี/ใช้ของ/หลบ/วิ่ง", 4200);

  // ── game loop: คำนวณ dt แบบหน่วงเวลาได้ (ไม่ให้กระตุกตอนสลับแอป) ──
  let last = performance.now();
  let acc = 0;
  const STEP = 1 / 60;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 4) { game.update(STEP); acc -= STEP; steps++; }
    if (steps === 0 && acc > STEP * 0.5) { /* รอสะสม */ }
    game.render();
    hud.update(dt);
    // FPS เฉลี่ย
    const fps = 1 / Math.max(dt, 0.0001);
    game.fps = game.fps * 0.9 + fps * 0.1;
    game.autoTune(game.fps);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // PWA + Service Worker (offline-first, Spec ข้อ 43) — เฉพาะเมื่อเปิดผ่าน http(s)
  // (เปิดผ่าน file:// จะไม่ลงทะเบียน เพื่อไม่ให้เกิด CORS error ในคอนโซล)
  if (location.protocol.startsWith("http")) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "manifest.webmanifest";
    document.head.appendChild(link);
    if ("serviceWorker" in navigator && window.top === window) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
}

boot().catch((e) => {
  console.error(e);
  $("lstep").textContent = "เริ่มเกมไม่สำเร็จ: " + e.message;
});
