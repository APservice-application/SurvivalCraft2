# SuvivalAcraft2

**2D Top-down Open World Survival RPG** — Survival · Farming · Crafting · Building · Magic
เป้าหมายหลัก: **เล่นบนมือถือ Android เป็นหลัก** (Mobile-first), Offline-first

> สถานะ: `PHASE 0 — Project Foundation` (กำลังดำเนินการ)

---

## 1. วิสัยทัศน์ (Core Vision)

เกม 2D มุมมองจากบนลงล่าง (Top-down) โลกเปิดที่ผู้เล่นใช้ชีวิตได้อย่างอิสระ:
สำรวจ → เก็บทรัพยากร → เอาตัวรอด → Craft → สร้างบ้าน → ปลูกพืช → ต่อสู้ → ใช้เวทมนตร์ → พัฒนาโลกของตัวเอง

ไม่มีเส้นทางการเล่นแบบเดียว ผู้เล่นเลือกเป็นนักสำรวจ / นักทำฟาร์ม / นักสร้าง / นักคราฟต์ / นักล่า / นักรบ / นักเวท / นักค้าขาย ได้เอง

เอกสาร Specification ฉบับเต็ม (50 ข้อ): [`docs/GAME_MASTER_ARCHITECTURE_TH.txt`](docs/GAME_MASTER_ARCHITECTURE_TH.txt)

---

## 2. หลักการสำคัญ (Non-negotiable Rules)

| # | กฎ |
|---|---|
| 1 | **ไม่สร้าง Game Engine ใหม่** — ใช้ Runtime/Engine ที่มีอยู่เป็น Rendering & Foundation |
| 2 | ใช้ระบบของ Engine ก่อนเสมอ (Physics / Tilemap / Animation / Audio / Resource / Save) |
| 3 | **Data-driven** — เพิ่ม Content ใหม่ได้โดยไม่แตะ Core (Item / Crop / Enemy / Spell / Recipe / Biome เป็น data) |
| 4 | **Mobile-first** — Virtual Joystick + ปุ่มกดง่าย ไม่บังเกม |
| 5 | **Offline-first** — ไม่บังคับ Login/Server/Internet |
| 6 | **Performance** — Chunk Streaming, Object Pooling, Culling, Texture Atlas, ไม่โหลดโลกทั้งใบเข้า RAM |
| 7 | **ทุก Phase ต้องมี Checkpoint** — Implementation → Testing → Validation ก่อนไป Phase ถัดไป |
| 8 | Definition of Done: Code ทำงาน + ต่อกับระบบอื่นได้ + UI มีจริง + ทดสอบแล้ว + Save/Load + ไม่ทำระบบอื่นพัง |

---

## 3. โครงสร้างโปรเจกต์ (Modules)

```
SuvivalAcraft2/
├── docs/            # Spec, Roadmap, Architecture, Style Guide, Checkpoints
├── src/
│   ├── core/        # Engine boot, loop, scene, input, audio, save, settings
│   ├── world/       # Seed, chunk streaming, biomes, terrain, resources, structures
│   ├── player/      # Movement, sprint, dodge, interaction, stats
│   ├── survival/    # HP / Hunger / Thirst / Stamina / Temperature / Status Effects
│   ├── items/       # Item & Equipment data + inventory
│   ├── crafting/    # Recipes, stations
│   ├── building/    # Place / rotate / remove / repair
│   ├── farming/     # Soil, seed, growth stages, harvest, quality
│   ├── combat/      # Melee / ranged / damage / status
│   ├── magic/       # Elements, spells, progression
│   ├── npc/ quest/ ai/ economy/
│   ├── weather/ time/
│   ├── ui/          # HUD, inventory, crafting, map, quest, settings
│   └── data/        # JSON data files (items, crops, enemies, spells, biomes...)
├── assets/          # Art / Audio / Fonts (license-checked)
└── tools/           # Build & test scripts
```

---

## 4. Roadmap (Phase 0 → 20)

ดูรายละเอียดที่ [`docs/ROADMAP.md`](docs/ROADMAP.md)

- [x] **PHASE 0** Project Foundation (repo, docs, structure, checkpoint workflow)
- [ ] PHASE 1 Player + Camera
- [ ] PHASE 2 World + TileMap
- [ ] PHASE 3 Biome + Procedural Generation
- [ ] PHASE 4 Inventory + Items
- [ ] PHASE 5 Gathering + Resources
- [ ] PHASE 6 Crafting
- [ ] PHASE 7 Building
- [ ] PHASE 8 Farming
- [ ] PHASE 9 Survival
- [ ] PHASE 10 Combat
- [ ] PHASE 11 Enemy AI
- [ ] PHASE 12 Magic
- [ ] PHASE 13 NPC
- [ ] PHASE 14 Quest
- [ ] PHASE 15 Economy
- [ ] PHASE 16 Events
- [ ] PHASE 17 Save/Load
- [ ] PHASE 18 UI/UX Polish
- [ ] PHASE 19 Performance
- [ ] PHASE 20 Final QA

---

## 5. การเก็บไฟล์ (Storage Policy)

- ไฟล์ทั้งหมดของโปรเจกต์ถูกเก็บไว้บน GitHub repo นี้ (source of truth)
- ไฟล์ Build / Cache / Library / Export ไม่ commit (ดู `.gitignore`) เพื่อไม่ให้พื้นที่เต็ม
- Art/Audio ขนาดใหญ่ใช้ **Git LFS** เมื่อเริ่มใส่ Asset จริง
