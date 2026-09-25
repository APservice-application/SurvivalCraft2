# ROADMAP & CHECKPOINT WORKFLOW

> กฎจาก Spec ข้อ 45–48: ห้ามเริ่ม Phase ใหม่ถ้า Core ของ Phase ก่อนหน้ายังพัง
> ทุก Phase ต้องผ่าน: **Implement → Test → Validate → Checkpoint → Commit/Push**

## สถานะปัจจุบัน

| Phase | ชื่อ | สถานะ | Checkpoint |
|---|---|---|---|
| 0 | Project Foundation | 🟡 กำลังทำ | — |
| 1 | Player + Camera | ⬜ | |
| 2 | World + TileMap | ⬜ | |
| 3 | Biome + Procedural Generation | ⬜ | |
| 4 | Inventory + Items | ⬜ | |
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

สัญลักษณ์: ⬜ ยังไม่เริ่ม · 🟡 กำลังทำ · ✅ เสร็จ+ทดสอบแล้ว · 🔴 ติดปัญหา

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
