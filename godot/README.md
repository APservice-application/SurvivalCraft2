# godot/ — Frontend ฝั่ง Godot 4.x

สถานะ: **โครงรากพร้อมรัน (PHASE 1 ของฝั่ง Godot)** — ผ่านการทดสอบ headless ใน CI แล้ว

## สิ่งที่ทำงานได้จริงตอนนี้

| ระบบ | ไฟล์ | สถานะ |
|---|---|---|
| โหลดข้อมูลกลาง (JSON ชุดเดียวกับเว็บ) | `scripts/GameData.gd` | ✅ ทดสอบแล้ว |
| Noise/hash deterministic (ตรงกับฝั่งเว็บเป๊ะ) | `scripts/Noise.gd` | ✅ พิสูจน์ด้วย `tools/test/determinism.mjs` |
| World generator (biome/tile/prop/จุดเกิด) | `scripts/WorldGen.gd` | ✅ โลกเหมือนฝั่งเว็บ 100% |
| Chunk streaming | `scripts/ChunkManager.gd` | ✅ ทดสอบ headless (โหลด 37 chunk) |
| ผู้เล่น + ชนกำแพง + survival stats | `scripts/PlayerActor.gd` | ✅ ทดสอบ headless |
| เวลา/แสงกลางวัน–กลางคืน | `scripts/GameTime.gd` | ✅ ทดสอบ headless |
| สภาพอากาศ 9 แบบตาม biome | `scripts/Weather.gd` | ✅ ทดสอบ headless |
| ปุ่มควบคุมมือถือ + จอยสติ๊กลอย | `scripts/MobileControls.gd` | ⚠️ โครงสร้างครบ ยังไม่ทดสอบบนอุปกรณ์จริง |
| Save/Load เบื้องต้น | `scripts/Main.gd` | ⚠️ โครง (Phase 17 จะทำให้เต็ม) |

## วิธีเปิด

1. ติดตั้ง [Godot 4.3+](https://godotengine.org/download)
2. ซิงก์ข้อมูลก่อน (จำเป็น — Godot อ่านไฟล์นอก `res://` ไม่ได้):
   ```bash
   node tools/sync-data.mjs      # หรือ npm run sync-data
   ```
3. เปิดโปรเจกต์: Godot → Import → เลือกไฟล์ `godot/project.godot` → Run (F5)

## วิธีทดสอบแบบไม่ต้องเปิดหน้าจอ (headless)

```bash
# ตรวจว่า import ไม่มี parse error + รันซีนหลัก 150 เฟรม + chunk streaming ทำงาน
GODOT_BIN=/path/to/godot npm run test:godot

# ตรวจว่าโลกจาก seed เดียวกันเหมือนกับฝั่งเว็บเป๊ะ (cross-frontend determinism)
GODOT_BIN=/path/to/godot npm run test:determinism
```

ทั้งสองคำสั่งถูกรันอัตโนมัติใน GitHub Actions (job `godot`)

## วิธี Export เป็น APK (Android)

1. ติดตั้ง **Android SDK + JDK 17** และตั้งค่าใน Godot: *Editor → Editor Settings → Export → Android*
2. สร้าง keystore แล้วกรอกใน *Project → Export → Android → Keystore*
3. เลือก preset **Android** → Export Project → ได้ไฟล์ `.apk` / `.aab`
4. ค่าที่ตั้งไว้แล้วเพื่อมือถือ: `renderer/rendering_method = mobile`, ปิด texture filter, snap 2D เป็นพิกเซล, viewport 720×1280

## หมายเหตุสถาปัตยกรรม

- **ห้ามสร้าง engine ย่อยในเกม** — ใช้ `TileMapLayer`, `CharacterBody2D`, `Camera2D`, `Control/Button`, `PackedByteArray` ฯลฯ ของ Godot
- ภาพ tile/prop ปัจจุบันเป็น procedural drawing + `Node2D` เปล่า (Phase 2 จะผูก `TileSet` + `AtlasTexture` จริง)
- กติกาตัวเลข (ความเร็วเดิน, การลดความหิว, ตารางอากาศ) ต้องตรงกับ `web/src/**` เสมอ — ถ้าจะแก้ ให้แก้ฝั่งเว็บก่อนแล้วพอร์ตตาม พร้อมรัน `npm run test:determinism`
- ในอนาคตจะย้ายกติกาที่เป็นตัวเลขล้วนเข้า `shared/data/*.json` เพื่อให้มีแหล่งความจริงเดียว (ลดงานพอร์ต)
