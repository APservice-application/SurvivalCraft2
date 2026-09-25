# CHECKPOINTS

บันทึกผลการตรวจสอบทุก Phase (ตาม Spec ข้อ 46)

---

## CHECKPOINT P00 — Project Foundation
- **วันที่:** 2026-09-25
- **สิ่งที่ implement:**
  - สร้าง GitHub repo `SuvivalAcraft2` (private)
  - วางโครงสร้างโฟลเดอร์โมดูลตาม Spec ข้อ 37
  - เก็บ Spec ฉบับเต็ม (50 ข้อ) ไว้ใน `docs/`
  - กำหนด `.gitignore` กันไฟล์ build/cache/ความลับ ไม่ให้พื้นที่เต็ม
  - กำหนด Roadmap + Definition of Done + Checkpoint workflow
- **ไฟล์ที่เพิ่ม:** `README.md`, `.gitignore`, `docs/*`
- **วิธีทดสอบ:** ตรวจโครงสร้างไฟล์ + push ขึ้น GitHub สำเร็จ
- **ผลทดสอบ:** ผ่าน (repo เข้าถึงได้, ไฟล์ครบ)
- **Save/Load:** N/A
- **Mobile Input:** N/A
- **ประสิทธิภาพ:** N/A
- **ปัญหาค้างอยู่:** ตัดสินใจใช้สถาปัตยกรรม dual-frontend (Web + Godot) ตามที่ผู้พัฒนาเลือก
- **Commit:** ดู `git log` (commit แรก `62bcf07`)

---

## CHECKPOINT P01 — Player + Camera (+ พื้นฐานโลก)
- **วันที่:** 2026-09-25
- **สิ่งที่ implement:**
  - **โครงรากเกม (web frontend):** game loop แบบ fixed-step 60 Hz, ระบบ input (จอยสติ๊กลอย + ปุ่มกด + คีย์บอร์ด + pinch zoom)
  - **ผู้เล่น:** เดิน 8 ทิศ, วิ่ง (ใช้สตามินา), กลิ้งหลบ (อมตะสั้น ๆ + คูลดาวน์), ชนกำแพงแบบแยกแกน, ความเร็วตามพื้นผิว
  - **กล้อง:** smooth follow + look-ahead + zoom + shake + minimap
  - **โลก:** chunk streaming ตามงบเวลาต่อเฟรม + unload อัตโนมัติ, 15 biome, ภูมิประเทศแบบ variant/transition/blended
  - **ระบบเวลา/แสง/อากาศ:** 7 ช่วงเวลา, แสงเปลี่ยนจริงพร้อมจุดกำเนิดแสง, อากาศ 9 แบบผูกกับ biome
  - **ระบบชีวิต:** HP/หิว/กระหาย/สตามินา/มานา/พลังงาน/อุณหภูมิร่างกาย/ความเปียก + สถานะผิดปกติ
  - **HUD:** หลอดสถานะ, นาฬิกา/อากาศ/biome, minimap, hotbar, แผงกระเป๋า/แผนที่/เมนู/ตาย
  - **Save/Load:** localStorage + autosave ทุก 30 วิ + ตอนปิดหน้า + round-trip test
  - **คุณภาพอัตโนมัติ:** ลดคุณภาพเมื่อ FPS ตก
  - **Godot frontend:** พอร์ต noise/worldgen/chunk/time/weather/player/mobile controls (รัน headless ผ่าน)
- **ไฟล์ที่เพิ่ม/แก้:** `web/src/**` (22 ไฟล์), `shared/data/*.json` (5), `godot/**` (12), `tools/**` (8), `docs/**` (6), `.github/workflows/` (2)
- **วิธีทดสอบ (รันอัตโนมัติทั้งหมด):**
  ```bash
  npm test                      # → 25/25 ผ่าน
  npm run build && npm run test:browser   # → 47/47 ผ่าน
  npm run test:iframe           # → 4/4 ผ่าน
  GODOT_BIN=... npm run test:godot        # → 5/5 ผ่าน
  GODOT_BIN=... npm run test:determinism  # → 4/4 ผ่าน
  ```
- **ผลทดสอบ:** ผ่านทั้งหมด (**85 การตรวจ**)
- **หลักฐาน:** ภาพหน้าจอใน `docs/screenshots/` (กลางวัน, กลางคืน+พายุ, กระเป๋า, แผนที่, 5 biome)
- **Save/Load:** ✅ ทดสอบ round-trip (seed/ตำแหน่ง/HP/วัน กลับมาตรง)
- **Mobile Input:** ✅ ทดสอบด้วยการจำลองนิ้วสัมผัส (จอยสติ๊กแสดง/เดินตามทิศ/ปล่อยแล้วหยุด)
- **ประสิทธิภาพ:** เฟรมเรนเดอร์ ~2.3 ms, tile ที่วาด 480/เฟรม (412×915), chunk 97 ใบในหน่วยความจำ, FPS 60 ในการจำลอง
- **ปัญหา/Bug ที่พบและแก้ในรอบนี้:** หน่วย zoom กล้องไม่ตรง (ภาพเละ) · หลังสร้างโลกใหม่/โหลดเซฟจอดำ (viewport=0) · จุดเกิดติดต้นไม้ · กฎ clearing ทำงานผิดจนต้นไม้หายทั้งภูมิภาค · ต้นไม้นับเป็น prop 3×3 จนไม่มีที่ว่าง · Noise ฝั่ง Godot ไม่ตรงกับเว็บ (props=0) · ข้อมูล biome ใช้ `[]` แทน `{}` ทำ Godot error
- **ปัญหาค้างอยู่ (Known Issues):**
  1. ฝั่ง Godot ยังวาดภูมิประเทศเป็น node เปล่า (ยังไม่ผูก TileSet จริง) — Phase 2
  2. HUD/Save ของ Godot ยังเป็นโครง
  3. ตัวเลขกติกาบางส่วนยังซ้ำกันสองที่ (web/godot) — แผนย้ายเข้า `shared/data` ใน Phase 4
- **Commit:** ดู `git log`
