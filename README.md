# CMU OR Status

ระบบติดตามสถานะห้องผ่าตัดฉุกเฉินแบบเรียลไทม์ พร้อมหน้าวิเคราะห์ KPI เวลารอเข้าห้องผ่าตัด

Real-time emergency OR status board with waiting-time KPI analytics.

---

## 1. ภาพรวม

ระบบมี 2 ฝั่ง:

- **หน้าจอสาธารณะ** — แสดงคิวเคสที่กำลังรอ/กำลังผ่าตัด อัปเดตสดผ่าน Supabase Realtime ทุกเครื่องที่เปิดหน้าเห็นตรงกันทันที
- **หน้าที่ต้องใส่ PIN** — ฟอร์มบันทึก/แก้ไขเคส และหน้าวิเคราะห์สถิติย้อนหลัง

### เส้นทาง (routes)

| Path | หน้า | PIN | หน้าที่ |
|---|---|---|---|
| `/dashboard` | Dashboard | ไม่ต้อง | บอร์ดสถานะหลัก realtime |
| `/update`, `/update/:id` | UpdaterForm | ต้อง | สร้าง/แก้ไขเคส |
| `/reserve` | ReserveForm | ต้อง | จองเคสด่วนแบบย่อ |
| `/kpi` | KpiDashboard | ต้อง | KPI เวลารอ + แนวโน้ม |
| `/dept` | DeptDashboard | ต้อง | สถิติรายภาควิชา/หน่วย + หัตถการที่พบบ่อย |
| `/idle` | IdleGapDashboard | ต้อง | ช่วงที่ห้องว่างทั้งที่มีเคสค้าง |

---

## 2. โครงสร้างข้อมูล

### ระดับความเร่งด่วน (condition)

`Immediate` › `Critical` › `Urgency` › `Expedited` › `Non-critical`

### สถานะเคส (status)

`Reserve` → `Waiting` → `Next` → `On case` → `Done`
โดยมี `In-active` (พักเคสไว้ก่อน เช่น รอ NPO) และ `Cancelled` แยกออกไป

เมื่อเคสเข้า/ออกสถานะ `In-active` ระบบบันทึกช่วงเวลาลงตาราง `or_inactive_periods`
เพื่อเก็บประวัติว่าเคสถูกพักไว้ช่วงไหนบ้างและเพราะอะไร

### เวลาที่ระบบบันทึกอัตโนมัติ (ผ่าน database trigger)

| คอลัมน์ | บันทึกเมื่อ |
|---|---|
| `created_at` | สร้างเคส = เวลารับเคส |
| `on_case_at` | เปลี่ยนสถานะเป็น `On case` ครั้งแรก |
| `done_at` | เปลี่ยนสถานะเป็น `Done` ครั้งแรก |

**นิยามที่ใช้คำนวณทั้งระบบ**

- **Waiting time** = `on_case_at − created_at` (เวลารับเคส → เริ่มผ่าตัด)
- **OR time** = `done_at − on_case_at` (ระยะเวลาที่ใช้ห้อง)

---

## 3. เกณฑ์ KPI

นับเฉพาะเคสที่ `status = 'Done'` และมี `on_case_at`

| หมวด | เป้าหมาย | วิธีจับคู่ |
|---|---|---|
| Severe Head Injury | ≤ 30 นาที | keyword ในช่อง `dx` |
| Immediate | ≤ 30 นาที | `condition = 'Immediate'` |
| Critical | ≤ 60 นาที | `condition = 'Critical'` |
| Urgency | ≤ 360 นาที | `condition = 'Urgency'` |
| Expedited / Non-critical | ไม่มีเป้า | นับปริมาณอย่างเดียว |

เกณฑ์ทั้งหมดนิยามไว้ที่ `KPI_CATEGORIES` ใน `src/components/KpiDashboard.jsx`
แก้ค่าเป้าหมายหรือเพิ่มหมวดได้ที่จุดนั้นจุดเดียว

Severe head ตรวจจับจาก keyword ในข้อความ diagnosis (ไม่มีคอลัมน์แยกใน DB)
รายการ keyword อยู่ที่ตัวแปร `SEVERE_HEAD_KEYWORDS`

### การจัดกลุ่มหัตถการ (หน้า `/dept`)

ช่อง `operation` เป็นข้อความอิสระ — ข้อมูลจริงมีการสะกดต่างกันกว่า 1,000 แบบ
จากเคสประมาณ 1,300 เคส และกว่า 900 แบบปรากฏเพียงครั้งเดียว จึงนับตรง ๆ ไม่ได้

ระบบจึงจัดกลุ่มด้วยกฎ keyword (`OP_GROUPS` ใน `src/components/DeptDashboard.jsx`)
ครอบคลุมประมาณ 89% ของเคส

**ข้อจำกัดที่ต้องรู้เวลาอ่านตัวเลข:** เคสที่ทำหลายหัตถการพร้อมกัน
(เช่น `DB Rt. foot + amp 2nd toe`) จะถูกนับครั้งเดียวในกลุ่มแรกที่เข้าเงื่อนไข
**ลำดับของกฎในอาร์เรย์คือ taxonomy จริง** — ย้ายลำดับแล้วตัวเลขเปลี่ยน

---

## 4. เทคโนโลยี

| ส่วน | เลือกใช้ |
|---|---|
| Frontend | React 18 + Vite 5 |
| Routing | React Router 6 |
| Styling | Tailwind CSS 3 |
| Backend / DB | Supabase (PostgreSQL + Realtime + RLS) |
| Deploy | Vercel (auto-deploy จาก branch `main`) |

ไม่ใช้ charting library — กราฟทุกตัวเขียนด้วย CSS/flexbox เอง เพื่อลดขนาด bundle

---

## 5. การติดตั้ง

```bash
npm install
cp .env.example .env     # แล้วเติมค่าจริงของ Supabase project ตัวเอง
npm run dev              # http://localhost:5173
```

### ตั้งค่าฐานข้อมูล

เปิด Supabase SQL Editor แล้วรันไฟล์ `db/schema.sql` ทั้งไฟล์
จะได้ตาราง constraint trigger และ RLS policy ครบ

### ตัวแปรสภาพแวดล้อม

| ตัวแปร | ความหมาย |
|---|---|
| `VITE_SUPABASE_URL` | URL ของ Supabase project |
| `VITE_SUPABASE_ANON_KEY` | publishable key |
| `VITE_UPDATER_PIN` | PIN สำหรับเข้าหน้าที่ถูกล็อก |

### คำสั่ง

```bash
npm run dev       # dev server
npm run build     # build ไป dist/
npm run preview   # ดู production build
```

---

## 6. โครงสร้างไฟล์

```
src/
  App.jsx                      routing ทั้งหมด
  supabaseClient.js            Supabase singleton
  lib/
    inactiveLog.js             เปิด/ปิดช่วง In-active
  components/
    Dashboard.jsx              บอร์ดหลัก realtime
    UpdaterForm.jsx            ฟอร์มเต็ม
    ReserveForm.jsx            ฟอร์มจองด่วน
    PinGate.jsx                หน้าใส่ PIN
    KpiDashboard.jsx           KPI + แนวโน้ม
    DeptDashboard.jsx          สถิติรายภาค + หัตถการ
    IdleGapDashboard.jsx       ช่วงห้องว่างทั้งที่มีเคสค้าง
db/
  schema.sql                   schema ฐานข้อมูลทั้งหมด
```

---

## 7. ข้อควรระวังเชิงเทคนิค

**เขตเวลา** — ระบบใช้เวลาไทย (UTC+7) การจัดกลุ่มตามวัน/เดือน/ปี
ต้องใช้ `getFullYear()` / `getMonth()` / `getDate()` เท่านั้น
**ห้ามใช้ `toISOString()`** ในการตัดช่วงวัน เพราะจะเหวี่ยงเป็น UTC
ทำให้เคสช่วงดึกตกไปอยู่ผิดวัน (ใช้ `toISOString()` ได้เฉพาะตอนส่งค่า timestamp เข้า DB)

**Tailwind** — ต้องเขียนชื่อคลาสเต็มเสมอ ห้ามประกอบชื่อคลาสแบบ dynamic
เพราะ Tailwind purge อ่านไม่เจอแล้วสีจะหาย

**คุณภาพข้อมูล** — ข้อมูลจริงประมาณ 28% ไม่ได้ระบุ `department`
และเคส Surgery จำนวนหนึ่งไม่ระบุ `subtype` หน้า `/dept` แสดงคำเตือนนี้ไว้ด้านบน
ตัวเลขรายหน่วยจึงเป็นค่าต่ำกว่าความจริง

**ห้องผ่าตัด** — ฐานข้อมูลไม่มีคอลัมน์ระบุห้อง หน้า `/idle` จึงนับว่า
"ห้องว่าง" เมื่อไม่มีเคสใดอยู่ในสถานะกำลังผ่าตัดเลย ถ้าโรงพยาบาลเปิดหลายห้อง
พร้อมกัน ตัวเลขช่วงว่างจะต่ำกว่าความจริง

---

## 8. ข้อจำกัดด้านความปลอดภัย (สำคัญ)

ระบบนี้พัฒนาเป็นเครื่องมือภายในเพื่อดูสถานะและสถิติ **ยังไม่ได้ออกแบบ
ระบบยืนยันตัวตนจริง** ผู้ที่จะนำไปใช้กับข้อมูลผู้ป่วยจริงต้องแก้ 3 จุดนี้ก่อน

**1. PIN ไม่ใช่ความลับ**
Vite ฝังตัวแปร `VITE_*` ทุกตัวลงในไฟล์ JavaScript ที่ส่งให้เบราว์เซอร์ตอน build
ดังนั้น PIN อ่านได้จาก bundle ของเว็บที่ deploy แล้ว PIN จึงกันได้แค่คนทั่วไป
ที่เผลอเปิดเข้ามา ไม่ได้กันคนที่ตั้งใจดู

**2. RLS policy เปิดกว้างทั้งหมด**
policy ปัจจุบันคือ `using (true)` ทุกตาราง แปลว่าใครก็ตามที่มี anon key
(ซึ่งอยู่ใน bundle สาธารณะอยู่แล้ว) อ่านและเขียนทุกแถวได้ รวมถึง HN และ diagnosis

**3. ข้อมูลผู้ป่วยอยู่ในฐานข้อมูลเดียวกับหน้าสาธารณะ**
ตาราง `or_cases` เก็บ HN + diagnosis + operation ซึ่งเป็นข้อมูลระบุตัวผู้ป่วยได้

### แนวทางแก้ก่อนใช้งานจริง

- เปิด Supabase Auth แล้วเปลี่ยน policy เป็น `using (auth.role() = 'authenticated')`
  สำหรับการเขียน และจำกัดการอ่านคอลัมน์ HN ไว้เฉพาะผู้ล็อกอิน
- ย้ายการตรวจสิทธิ์จาก PIN ฝั่ง client ไปเป็นการล็อกอินจริง
- แยก view สาธารณะที่ไม่มี HN/diagnosis ออกจากตารางหลัก
- ไม่ commit ไฟล์ `.env` และไม่ commit ไฟล์ส่งออก (`.xlsx`, `.csv`)
  ที่มี HN หรือ diagnosis — `.gitignore` กันไว้แล้ว

---

## 9. สถานะปัจจุบัน

เป็นงานที่ยังพัฒนาต่อเนื่อง ใช้งานจริงในลักษณะเครื่องมือช่วยติดตามคิว
ส่วนวิเคราะห์ KPI ใช้สำหรับดูแนวโน้มภายใน ยังไม่ได้ผ่านการ validate
เทียบกับเวชระเบียนอย่างเป็นทางการ
