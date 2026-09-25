// web/src/core/save.js — SAVE / LOAD (Spec ข้อ 35)
// เก็บ: seed, ผู้เล่น+stats, เวลา, อากาศ, กล้อง, chunk ที่แก้ไข — โหลดกลับได้ไม่เสีย World State
export const SAVE_VERSION = 1;
const KEY = "survivalcraft2.save.v1";
const KEY_AUTO = "survivalcraft2.autosave.v1";

function tryParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
/** อ่าน/เขียน localStorage แบบปลอดภัย — sandboxed iframe หรือ private mode อาจโยน SecurityError */
function lsGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
function lsDel(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

export const SaveSystem = {
  available() {
    try { localStorage.setItem("__sc2t", "1"); localStorage.removeItem("__sc2t"); return true; } catch (e) { return false; }
  },
  /** true ถ้าเซฟได้จริง (ใช้เตือนผู้เล่นในโหมดที่ไม่รองรับ) */
  get persistent() { return this._persistent !== false; },

  serialize(game) {
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      seed: game.seed,
      player: game.player.serialize(),
      time: game.time.serialize(),
      weather: game.weather.serialize(),
      camera: game.camera.serialize(),
      stats: { playSeconds: Math.floor(game.playSeconds), day: game.time.day },
      world: {
        chunkMods: game.chunks.serializeModifications(),
        spawn: game.spawnPoint,
        explored: Array.from(game.exploredChunks).slice(-4000),
      },
      settings: game.settings,
    };
  },

  save(game, slot = "manual") {
    const key = slot === "auto" ? KEY_AUTO : KEY;
    const ok = lsSet(key, JSON.stringify(this.serialize(game)));
    if (!ok) this._persistent = false;
    return ok;
  },

  load(slot = "manual") {
    const key = slot === "auto" ? KEY_AUTO : KEY;
    const data = tryParse(lsGet(key) || "");
    if (!data) return null;
    if (data.version !== SAVE_VERSION) console.warn("save version ต่างจากปัจจุบัน — พยายามโหลดต่อ", data.version);
    return data;
  },

  hasSave(slot = "manual") { return !!lsGet(slot === "auto" ? KEY_AUTO : KEY); },
  clear(slot = "manual") { lsDel(slot === "auto" ? KEY_AUTO : KEY); },
  info(slot = "manual") {
    const d = this.load(slot);
    if (!d) return null;
    return { savedAt: d.savedAt, seed: d.seed, day: d.stats?.day || 1, playSeconds: d.stats?.playSeconds || 0 };
  },
};
