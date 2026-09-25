# ROADMAP & CHECKPOINT WORKFLOW

> กฎจาก Spec ข้อ 45–48: ห้ามเริ่ม Phase ใหม่ถ้า Core ของ Phase ก่อนหน้ายังพัง
> ทุก Phase ต้องผ่าน: **Implement → Test → Validate → Checkpoint → Commit/Push**

## สถานะปัจจุบัน

| Phase | ชื่อ | สถานะ | Checkpoint |
|---|---|---|---|
| 0 | Project Foundation | ✅ | P00 (2026-09-25) — repo, เอกสาร, CI, ชุดทดสอบ 5 ชุด |
| 1 | Player + Camera | ✅ | P01 (2026-09-25) — เดิน/วิ่ง/กลิ้งหลบ/ชนกำแพง/กล้อง/มือถือ/HUD/save |
| 2 | World + TileMap | 🟢 บางส่วน | P02 — chunk streaming + ภูมิประเทศมี texture ครบ (ยังไม่ผูก TileSet ฝั่ง Godot) |
| 3 | Biome + Procedural Generation | 🟢 บางส่วน | P03 — 15 biome + กฎ decoration/cluster/clearing + determinism ข้าม frontend |
| 4 | Inventory + Items | ⬜ (ถัดไป) | |
| 5 | Gathering + Resources | ⬜ | |
| 6 | Crafting | ⬜ | |
| 7 | Building | ⬜ | |
| 8 | Farming | ⬜ | |
| 9 | Survival | ⬜ | |
| 10 | Combat | ⬜ | |
| 11 | Enemy AI | ⬜ | |
| 12 | Magic | ⬜ | |
| 13 | NPC | ⬜ | |
| 14 | Quest | ⬜ | |
| 15 | Economy | ⬜ | |
| 16 | Events | ⬜ | |
| 17 | Save/Load | ⬜ | |
| 18 | UI/UX Polish | ⬜ | |
| 19 | Performance | ⬜ | |
| 20 | Final QA | ⬜ | |

สัญลักษณ์: ⬜ ยังไม่เริ่ม · 🟡 กำลังทำ · 🟢 ทำบางส่วน · ✅ เสร็จ+ทดสอบแล้ว · 🔴 ติดปัญหา

### รายละเอียด Phase 1 (สิ่งที่ส่งมอบ + หลักฐาน)

| สิ่งที่ส่งมอบ | หลักฐาน |
|---|---|
| ผู้เล่นเดิน/วิ่ง/กลิ้งหลบ + ชนกำแพงแบบไถล | `npm test` → collision, dodge, movement (25/25) |
| กล้องตามนุ่มนวล + look-ahead + shake + pinch zoom | `npm run test:browser` → glm้องห่างผู้เล่น 0.37 tile |
| ปุ่มควบคุมมือถือ (จอยสติ๊กลอย + 6 ปุ่ม) | ทดสอบด้วยการจำลองนิ้วสัมผัสจริงใน Chrome |
| HUD ครบ (HP/หิว/กระหาย/สตามินา/มานา/เวลา/อากาศ/biome/minimap/hotbar) | ภาพใน `docs/screenshots/` |
| เวลา 7 ช่วง + แสงกลางวัน–กลางคืน + ฝน/พายุ/หมอก/หิมะ | ทดสอบกลางคืน: light 0.12, ตัวเปียกเพิ่ม |
| Save/Load + autosave | ทดสอบ round-trip (ตำแหน่ง/HP/วัน/seed) |
| ตรวจ "จอดำ" หลัง newWorld/load/เปลี่ยนคุณภาพ | regression suite 3 กรณี × 3 การตรวจ |
| Godot frontend รันได้ + โลกตรงกับเว็บ | `npm run test:godot`, `npm run test:determinism` |

---

## Definition of Done (Spec ข้อ 48)

Feature จะนับว่า "เสร็จ" เมื่อครบทุกข้อ:

1. Code ทำงานจริง ไม่ใช่แค่ compile ผ่าน
2. เชื่อมกับระบบที่เกี่ยวข้องแล้ว (ไม่ใช่ระบบลอย)
3. UI มีจริงและใช้งานได้
4. มี Error Handling
5. Save/Load รองรับ (ถ้า state ต้องถูกจำ)
6. Mobile Input รองรับ (ถ้าเกี่ยวข้อง)
7. Performance ผ่านเกณฑ์บนมือถือระดับกลาง
8. ทดสอบแล้ว (build + run + playtest)
9. ไม่ทำให้ระบบอื่นพัง

---

## Checkpoint Template (ใช้ทุก Phase)

```
## CHECKPOINT P<xx> — <ชื่อ Phase>
- วันที่:
- สิ่งที่ implement:
- ไฟล์ที่เพิ่ม/แก้:
- วิธีทดสอบ:
- ผลทดสอบ: (ผ่าน/ไม่ผ่าน + หลักฐาน)
- Save/Load: 
- Mobile Input: 
- ประสิทธิภาพ (FPS/หน่วยความจำ):
- ปัญหาค้างอยู่ (Known Issues):
- Commit: <sha>
```

บันทึกผลจริงไว้ที่ `docs/CHECKPOINTS.md`
