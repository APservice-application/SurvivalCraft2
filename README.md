# SurvivalCraft2 🌱⚔️✨

**2D Top-down Open World Survival RPG** — เอาตัวรอด · ฟาร์ม · คราฟต์ · สร้างฐาน · เวทมนตร์
เป้าหมายหลัก: **เล่นบนมือถือ Android เป็นหลัก** (Mobile-first) · **Offline-first** · ไม่บังคับล็อกอิน

> สถานะปัจจุบัน: **PHASE 1 ✅** (โครงราก + โลกมีชีวิต + ผู้เล่น + มือถือ) — PHASE 2/3 (โลก/biome) ทำเสร็จบางส่วนแล้ว

## 🎮 เล่นเลย

| ช่องทาง | ลิงก์ | หมายเหตุ |
|---|---|---|
| **เว็บ (มือถือ Android)** | https://apservice-application.github.io/SurvivalCraft2/ | เปิดใน Chrome → เมนู ⋮ → *เพิ่มลงหน้าจอหลัก* = เล่นเต็มจอแบบออฟไลน์ (PWA) |
| ในเครื่อง | `npm run serve` → http://localhost:8080 | ใช้เมื่อต้องทดสอบ Service Worker |
| ไฟล์เดียว | `web/dist/index.html` | ดับเบิลคลิกเปิดได้เลย ไม่ต้องมีเซิร์ฟเวอร์ |

**วิธีเล่น:** ลากครึ่งซ้ายของจอ = เดิน · ปุ่มขวา = โจมตี/ใช้ของ/หลบ/วิ่ง · เวท ✨ · 🎒 กระเป๋า · 🗺 แผนที่ · ⏸ เมนู (บันทึก/โหลด/โลกใหม่/คุณภาพภาพ) · หยิกสองนิ้ว = ซูม
(เดสก์ท็อป: WASD เดิน, Shift วิ่ง, Space หลบ, F ใช้, Tab กระเป๋า, M แผนที่, Esc เมนู, F3 ดีบัก)

## ✅ สิ่งที่ทำเสร็จและทดสอบแล้ว

| ระบบ | รายละเอียด |
|---|---|
| **โลกเปิดจาก seed** | deterministic 100% — seed เดียวกันได้โลกเดียวกันทุกครั้ง (ไม่ต้องเซฟ tile ทั้งโลก) |
| **15 biome** | ทุ่งหญ้า ป่า ป่าลึก หนองน้ำ ทะเลทราย ภูเขา หิมะ หาดทราย แม่น้ำ/ทะเลสาบ ซากปรักหักพัง เขตเวทมนตร์ ถ้ำ ทะเล ฯลฯ แต่ละที่มีพืช/ทรัพยากร/อุณหภูมิ/ศัตรู/เพลงต่างกัน |
| **Chunk streaming** | โหลด/ทิ้ง chunk รอบผู้เล่น ใช้งบเวลา ~3 ms/เฟรม (ไม่โหลดโลกทั้งใบเข้า RAM) |
| **ภูมิประเทศมี texture จริง** | ทุก tile มี 8 variant + เกรนละเอียด + รอยต่อ blended + ต้นไม้/หญ้า/เห็ด/ดอกไม้/หิน/ผลึกเวท พร้อมเงาและไฮไลต์ (ไม่ใช่บล็อกสีเรียบ) |
| **ผู้เล่น** | เดิน 8 ทิศ วิ่ง กลิ้งหลบ (มีช่วงอมตะ) ชนกำแพง/ไถลตามกำแพง ความเร็วเปลี่ยนตามพื้นผิว |
| **ระบบชีวิตเชื่อมโยง** | HP หิว กระหาย สตามินา มานา พลังงาน อุณหภูมิร่างกาย ความเปียก + สถานะผิดปกติ (ฝน→เปียก→หนาว→Hypothermia) |
| **เวลา + แสง** | 1 วัน = 16 นาที, 7 ช่วงเวลา, แสงเปลี่ยนจริง + จุดกำเนิดแสง (คบเพลิง/ผลึก) |
| **อากาศ 9 แบบ** | ฝน ฝนหนัก พายุ หมอก หิมะ ลม ร้อนจัด มีผลกับตัวเกม (ความเร็ว/ความเปียก/อุณหภูมิ) และสุ่มตาม biome อย่างสมเหตุสมผล |
| **HUD + มือถือ** | หลอดสถานะ, นาฬิกา/อากาศ/biome, minimap, hotbar, แผงกระเป๋า/แผนที่/เมนู/ตาย, จอยสติ๊กลอย |
| **Save/Load** | เก็บ seed + ตัวผู้เล่น + เวลา + อากาศ + กล้อง + สิ่งที่แก้ในโลก, autosave ทุก 30 วิ และตอนปิดหน้า |
| **คุณภาพอัตโนมัติ** | ถ้า FPS ตกจะลดคุณภาพภาพเองพร้อมแจ้งผู้เล่น |
| **Godot frontend** | โครงรากพร้อมรัน: world generator พอร์ตมาแล้ว และ **โลกตรงกับฝั่งเว็บ 100%** (พิสูจน์ด้วย hash) |

## 🧪 ทดสอบ (ทั้งหมดรันอัตโนมัติใน CI)

```bash
npm install
npm test                  # 25 การทดสอบ game logic (ไม่ต้องใช้เบราว์เซอร์)
npm run build             # รวมเกมเป็นไฟล์เดียว web/dist/index.html
npm run test:browser      # 47 การทดสอบใน Chrome มือถือจำลอง (walk/sprint/dodge/night/biome/save/UI/regression)
npm run test:iframe       # รันใน sandboxed iframe ได้ (กรณีเปิดใน preview)
npm run test:godot        # Godot headless: import + รันซีนหลัก 150 เฟรม
npm run test:determinism  # Web vs Godot: โลกจาก seed เดียวกันต้องเหมือนกันเป๊ะ
```

ผลทดสอบล่าสุด: logic **25/25** · browser **47/47** · iframe **4/4** · Godot **5/5** · determinism **4/4** (ภาพผลทดสอบอยู่ใน `docs/screenshots/`)

## 📁 โครงสร้าง

```
shared/data/    ← content ทั้งหมด (ใช้ร่วม Web + Godot): tiles, biomes, world, items, recipes
web/            ← Frontend หลักที่เล่นได้ตอนนี้ (HTML5 Canvas + PWA)
  src/core/     loop, input, save, data loader, math/noise
  src/world/    worldgen, chunk streaming
  src/render/   camera, procedural texture, renderer (light/weather)
  src/player/   player + survival stats
  src/systems/  time, weather
  src/ui/       HUD + CSS
godot/          ← Frontend Godot 4.x (Mobile renderer) + data ที่ซิงก์จาก shared
tools/          build, serve, sync-data, test (logic/browser/iframe/godot/determinism)
docs/           สเปก 50 ข้อ, สถาปัตยกรรม, roadmap, checkpoint, style guide, ภาพหน้าจอ
```

## 📚 เอกสาร

- [`docs/GAME_MASTER_ARCHITECTURE_TH.txt`](docs/GAME_MASTER_ARCHITECTURE_TH.txt) — สเปกฉบับเต็ม 50 ข้อ (คำสั่งสูงสุดของโปรเจกต์)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — แผน 21 Phase + นิยาม "เสร็จ"
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — สถาปัตยกรรม, determinism, ประสิทธิภาพ, แผนไป APK
- [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md) — เกมเพลย์/ระบบ/การควบคุม
- [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) — จานสี/ขนาด/กฎคุณภาพภาพ (บังคับใช้กับทุก asset)
- [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md) — บันทึกผลตรวจทุก Phase
- [`godot/README.md`](godot/README.md) — วิธีเปิด/ทดสอบ/export APK ฝั่ง Godot

## 🔜 ขั้นต่อไป (PHASE 4)

Inventory + Item เต็มรูปแบบ → เก็บทรัพยากรจากต้นไม้/หิน (PHASE 5) → คราฟต์ (6) → สร้างบ้าน (7) → ฟาร์ม (8)

## ⚠️ ข้อควรระวังด้านความปลอดภัย

- อย่า commit token/keystore — `.gitignore` กันไว้แล้ว (`*.key`, `*.keystore`, `*token*`)
- Token ที่เคยส่งในแชทควรถูก revoke และสร้างใหม่แบบจำกัดสิทธิ์ (`repo` เท่านั้น)
