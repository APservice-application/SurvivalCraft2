# ARCHITECTURE — SurvivalCraft2

> เอกสารนี้กำหนดว่า "โค้ดอยู่ตรงไหน ทำอะไร และทำไม" (Spec ข้อ 2, 37, 38, 44)
> กฎเหล็ก: **เกมนี้ไม่สร้าง Game Engine ใหม่** — ใช้ Runtime ที่มีอยู่ (เบราว์เซอร์ Canvas 2D / Godot) เป็น Rendering & Foundation

## 1. ภาพรวม: dual-frontend + shared core

```
                     ┌────────────────────────────┐
                     │        shared/             │  ← แหล่งความจริงเดียวของกติกาเกม
                     │  data/*.json  (content)    │     (ใช้ร่วมทั้งสอง frontend)
                     │  rules/*.js   (กติกา)      │
                     └──────────┬─────────────────┘
                                │  (ซิงก์ด้วย tools/sync-data.mjs)
        ┌───────────────────────┴────────────────────────┐
        │                                                │
┌───────▼──────────────────┐              ┌──────────────▼─────────────────┐
│  web/  (Playable ตอนนี้) │              │  godot/  (โครงพร้อมต่อยอด)      │
│  HTML5 + Canvas 2D + PWA  │              │  Godot 4.x (Mobile renderer)   │
│  ├ src/core    loop/input │              │  ├ scripts/Noise.gd            │
│  ├ src/world   worldgen   │              │  ├ scripts/WorldGen.gd (พอร์ต)  │
│  ├ src/render  camera/tex │              │  ├ scripts/ChunkManager.gd      │
│  ├ src/player  player     │              │  ├ scripts/PlayerActor.gd       │
│  ├ src/systems time/weather│             │  ├ scripts/GameTime.gd/Weather  │
│  └ src/ui      HUD/CSS    │              │  └ scripts/MobileControls.gd    │
└──────────────────────────┘              └─────────────────────────────────┘
        │                                                │
        └────────── tools/test/determinism.mjs ──────────┘
             (พิสูจน์ว่า seed เดียวกัน → โลกเหมือนกันเป๊ะ)
```

### ทำไมต้อง dual-frontend

| เหตุผล | รายละเอียด |
|---|---|
| เล่นได้ทันทีบน Android | Web + PWA เปิดใน Chrome มือถือได้เลย ไม่ต้องติดตั้ง APK |
| ตรงตาม Spec (Engine) | Godot เป็น Engine หลักตาม Spec ข้อ 1 และต่อยอดเป็น APK/Play Store ได้ |
| ลดความเสี่ยง | ถ้า Engine ใดมีข้อจำกัด อีกตัวยังเดินต่อได้ โดยใช้ data/rules ชุดเดียวกัน |
| ทดสอบได้จริง | ฝั่งเว็บทดสอบอัตโนมัติใน sandbox ได้ (headless Chrome) ทำให้ตรวจงานได้ทุก Phase |

## 2. ชั้นของระบบ (Layers)

| ชั้น | หน้าที่ | ตัวอย่างไฟล์ | ห้ามทำ |
|---|---|---|---|
| **Engine/Runtime** | render, input, loop, audio, physics | เบราว์เซอร์ Canvas2D, Godot | เขียน renderer/physics ใหม่ |
| **Core** | bootstrap, loop, save, settings, input map | `web/src/core/{game,input,save}.js` | ใส่กติกาเกม |
| **World** | seed, noise, biome, chunk streaming | `web/src/world/*` | วาดภาพ |
| **Systems** | เวลา, อากาศ, survival, (ต่อ ๆ ไป combat/magic/farming) | `web/src/systems/*` | รู้จัก DOM |
| **Entities** | player, NPC, enemy | `web/src/player/*` | อ่าน/เขียน save โดยตรง |
| **Presentation** | กล้อง, texture, HUD | `web/src/render/*`, `web/src/ui/*` | ตัดสินกติกาเกม |
| **Data** | content ทั้งหมด (JSON) | `shared/data/*.json` | ฝังค่าในโค้ด |

**หลักการ**: Game Logic ต้องไม่ผูกกับ UI/เรนเดอร์ → เพื่อให้ต่อ Multiplayer (Spec ข้อ 44) และทดสอบได้โดยไม่มีจอ (ปัจจุบัน `tools/test/logic.test.mjs` รัน Game Logic ทั้งหมดใน Node ได้)

## 3. Determinism (หัวใจของโลกเปิด)

- ใช้ `Noise` (value noise + fBm) + `hash2/hash3` ที่ **ไม่ขึ้นกับเวลา/เครื่อง**
- เก็บเฉพาะ `seed` + "การแก้ไขของผู้เล่น" (building/farm) → ไม่ต้องเก็บ tile ทั้งโลกในเซฟ
- Chunk ที่ถูก unload แล้วสร้างใหม่ได้ผลเดิมเพราะการสร้างเป็นฟังก์ชันบริสุทธิ์ของ (seed, cx, cy)
- **ทดสอบ**: `tools/test/determinism.mjs` เทียบ Web ↔ Godot ด้วย hash ของ tile/props

## 4. Performance Architecture (Spec ข้อ 42)

| กลไก | ทำงานอย่างไร |
|---|---|
| Chunk streaming | โหลดรัศมีรอบผู้เล่น (3–5 chunk) ใช้งบเวลา 3–4 ms/เฟรม |
| Deterministic unload | ทิ้ง chunk ที่ไกลเกิน keep radius (สร้างใหม่ได้ ไม่ต้องเก็บ) |
| Texture cache | สร้างสไปรต์ tile/prop ครั้งเดียวแล้ว memoize (`TileTextureCache`) |
| Culling | วาดเฉพาะ tile/prop ที่อยู่ในกรอบกล้อง |
| Fixed-step update | ตรรกะเดินที่ 60 Hz คงที่, เรนเดอร์ตาม refresh rate จริง |
| Auto quality | ถ้า FPS เฉลี่ย < 42 ต่อเนื่อง → ลดคุณภาพภาพอัตโนมัติ + แจ้งผู้เล่น |
| Object budget | prop sprite สร้างครั้งเดียวต่อ (ชนิด × variant) ไม่สร้างต่อตัวบนจอ |

## 5. Save/Load Architecture (Spec ข้อ 35)

บันทึก: `version, seed, player(x,y,facing,stats,effects), time, weather, camera, world.chunkMods, explored, settings, playSeconds`

- เว็บ: `localStorage` (มี `try/catch` รองรับ sandbox/private mode — เกมยังเล่นได้แต่ไม่เก็บเซฟ)
- Godot: `user://save_slot1.json`
- Autosave: ทุก 30 วิ + ตอนซ่อนแท็บ/ปิดหน้า (`visibilitychange`, `pagehide`)
- **ไม่บันทึก terrain ทั้งโลก** — สร้างกลับจาก seed (ไฟล์เซฟเล็กมาก)

## 6. Data-driven (Spec ข้อ 36)

| ไฟล์ | กำหนดอะไร |
|---|---|
| `shared/data/tiles.json` | tile ทั้งหมด + texture recipe + prop (ต้นไม้/หิน) + ทรัพยากรที่ได้ |
| `shared/data/biomes.json` | 15 biome: terrain/vegetation/decoration/temperature/humidity/สัตว์/ศัตรู/โครงสร้าง |
| `shared/data/world.json` | พารามิเตอร์ noise, threshold, กฎ decoration, เวลา, ตารางอากาศ |
| `shared/data/items.json` | ไอเทม (ทรัพยากร/อาหาร/เครื่องมือ/อาวุธ/ยา/เวท) |
| `shared/data/recipes.json` | คราฟต์ + station + พืช (crops) สำหรับ Phase 6/8 |

การเพิ่ม biome/ไอเทมใหม่ = แก้ JSON ไม่ต้องแตะ core → ตรงกับ Spec ข้อ 50 (ขยายได้ไม่ต้อง Rewrite)

## 7. แผนที่ไปสู่ APK (Android)

1. **ตอนนี้** — PWA: เปิด URL บน Chrome Android → "เพิ่มลงหน้าจอหลัก" → เล่นเต็มจอแบบออฟไลน์
2. **ถัดไป** — Wrap ด้วย Capacitor (ใช้ `web/dist/index.html`) → ได้ `.aab/.apk` ลง Play Store
3. **ทางเลือกเต็มรูปแบบ** — ใช้ Godot ที่เตรียมไว้ (`godot/`) → export APK ด้วย `rendering_method=mobile` (ตั้งค่าไว้แล้ว)

## 8. สถานะการทดสอบ (อัตโนมัติทั้งหมด)

| ชุดทดสอบ | คำสั่ง | สิ่งที่ตรวจ |
|---|---|---|
| Logic (Node) | `npm test` | data integrity, determinism, collision, survival, time/weather, save |
| Browser (Chrome headless) | `npm run test:browser` | เกมรันจริงบนมือถือจำลอง, เดิน/วิ่ง/หลบ, กลางคืน, biome, UI, save/load, regression |
| Iframe sandbox | `npm run test:iframe` | รันได้ใน sandboxed iframe (กรณี preview ในแอป) |
| Godot headless | `npm run test:godot` | import ไม่มี parse error, รันซีนหลัก 150 เฟรม, chunk streaming |
| Cross-frontend | `npm run test:determinism` | Web กับ Godot สร้างโลกจาก seed เดียวกันเหมือนกันเป๊ะ |
