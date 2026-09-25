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
- **ปัญหาค้างอยู่:** ยังไม่เลือก Runtime/Engine (รอผู้พัฒนายืนยัน)
- **Commit:** ดู `git log`
