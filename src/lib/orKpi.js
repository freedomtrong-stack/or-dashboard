// Shared KPI model for the Set → Accept → Arrival → Incision timeline.
//
// Legacy note: `on_case_at` was filled inconsistently by staff (some meant
// "patient in the room", some meant "knife to skin"), so it is only ever used
// as an approximate fallback for arrival and is always flagged as such.

export const PRIORITIES = [
  { key: 'Immediate',    level: 1, target: 30,  color: 'bg-red-600',    text: 'text-red-400' },
  { key: 'Critical',     level: 2, target: 60,  color: 'bg-orange-500', text: 'text-orange-400' },
  { key: 'Urgency',      level: 3, target: 360, color: 'bg-yellow-400', text: 'text-yellow-400' },
  { key: 'Expedited',    level: 4, target: null, color: 'bg-blue-500',  text: 'text-blue-400' },
  { key: 'Non-critical', level: 5, target: null, color: 'bg-gray-500',  text: 'text-gray-400' },
]

export const SHI_TARGET = 30

export const PRIORITY_BY_KEY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]))

export const priorityLabel = (cond) => {
  const p = PRIORITY_BY_KEY[cond]
  return p ? `${p.level} ${p.key}` : (cond ?? '—')
}

// Standard delay reasons, each paired with the team that owns the process.
// Mirrors the department's Google Sheets dropdown so reports line up.
export const DELAY_REASONS = [
  { reason: 'รอห้องผ่าตัด/ห้องไม่พร้อม',        owner: 'OR' },
  { reason: 'รอทีมศัลยแพทย์',                   owner: 'Surgery' },
  { reason: 'รอทีมวิสัญญี',                     owner: 'Anesthesia' },
  { reason: 'รอพยาบาล/บุคลากร',                 owner: 'Nursing/Ward' },
  { reason: 'รอเครื่องมือ/อุปกรณ์/Implant',      owner: 'CSSD/Equipment' },
  { reason: 'รอเลือด/ส่วนประกอบของเลือด',        owner: 'Blood Bank' },
  { reason: 'รอผลตรวจ/การวินิจฉัยเพิ่มเติม',     owner: 'Lab/Radiology' },
  { reason: 'รอเตรียมผู้ป่วย/แก้ไขสภาวะผู้ป่วย', owner: 'ICU/PACU' },
  { reason: 'รอ NPO ครบ',                       owner: 'Transport' },
  { reason: 'รอเตียง ICU/PACU/Ward',            owner: 'ICU/PACU' },
  { reason: 'การเคลื่อนย้ายผู้ป่วยล่าช้า',       owner: 'Transport' },
  { reason: 'มีเคสฉุกเฉินเร่งด่วนกว่าแทรก',      owner: 'Multidisciplinary' },
  { reason: 'เปลี่ยนแผนการรักษา/การผ่าตัด',      owner: 'Multidisciplinary' },
  { reason: 'ผู้ป่วย/ญาติ',                     owner: 'Patient/Family' },
  { reason: 'อื่น ๆ',                           owner: 'Other' },
  // Distinct from "not filled in yet": someone reviewed the case and genuinely
  // could not establish why it ran late. Recording that honestly beats guessing
  // a plausible reason, which would look real in the report.
  { reason: 'ไม่ทราบสาเหตุ',                     owner: 'Unknown' },
]

export const UNKNOWN_REASON = 'ไม่ทราบสาเหตุ'

export const PROCESS_OWNERS = [...new Set(DELAY_REASONS.map((d) => d.owner))]

export const ownerFor = (reason) =>
  DELAY_REASONS.find((d) => d.reason === reason)?.owner ?? null

// ── Time helpers ────────────────────────────────────────────────────────────
const ms = (t) => (t ? new Date(t).getTime() : null)

const diffMin = (from, to) => {
  const a = ms(from), b = ms(to)
  if (a == null || b == null) return null
  const m = (b - a) / 60000
  return m >= 0 ? m : null
}

// Arrival, preferring the explicit field and falling back to the legacy one.
export function arrivalOf(c) {
  if (c.arrival_at) return { at: c.arrival_at, approximate: false }
  if (c.on_case_at) return { at: c.on_case_at, approximate: true }
  return { at: null, approximate: false }
}

export function targetFor(c) {
  if (c.shi_fast_track) return SHI_TARGET
  return PRIORITY_BY_KEY[c.condition]?.target ?? null
}

// Every interval the report needs, computed once per case.
export function timings(c) {
  const arrival = arrivalOf(c)
  const setToArrival = diffMin(c.created_at, arrival.at)
  const target = targetFor(c)

  return {
    setToAccept:      diffMin(c.created_at, c.accepted_at),
    acceptToArrival:  diffMin(c.accepted_at, arrival.at),
    setToArrival,                                   // the headline KPI
    arrivalToIncision: diffMin(arrival.at, c.incision_at),
    orTime:           diffMin(c.incision_at ?? arrival.at, c.done_at),
    target,
    approximate: arrival.approximate,
    delayMin: target != null && setToArrival != null
      ? Math.max(0, Math.round(setToArrival - target))
      : null,
    status: target == null || setToArrival == null
      ? 'No target'
      : setToArrival <= target ? 'On-time' : 'Delayed',
  }
}

export const isDelayed = (c) => timings(c).status === 'Delayed'

// A delayed case is only fully documented once a reason has been recorded.
export const needsReason = (c) => isDelayed(c) && !c.delay_reason

export function fmtMins(m) {
  if (m == null) return '—'
  const mins = Math.round(m)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function median(nums) {
  const s = nums.filter((n) => n != null).sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function quantile(nums, q) {
  const s = nums.filter((n) => n != null).sort((a, b) => a - b)
  if (s.length === 0) return null
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

// ── Period filtering (LOCAL date methods only — Thailand is UTC+7) ──────────
export function inPeriod(date, granularity, anchor) {
  if (granularity === 'all') return true
  const d = new Date(date)
  if (granularity === 'year') return d.getFullYear() === anchor.getFullYear()
  if (granularity === 'month') {
    return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth()
  }
  if (granularity === 'quarter') {
    return d.getFullYear() === anchor.getFullYear()
      && Math.floor(d.getMonth() / 3) === Math.floor(anchor.getMonth() / 3)
  }
  return true
}

// Midnight today, in local time — the anchor every day-range check counts back from.
function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

// Whole days elapsed since a case was received. Drives the stale-recall warning:
// a delay reason recalled a week later is closer to a guess than a record.
export function daysSince(date) {
  const d = new Date(date)
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((startOfToday() - dayStart) / 86400000)
}

export const RECALL_STALE_DAYS = 7

// Quick ranges for the daily review rhythm, plus the calendar fallbacks.
export const RANGES = [
  { key: 'yesterday', label: 'เมื่อวาน' },
  { key: 'last7',     label: '7 วันล่าสุด' },
  { key: 'month',     label: 'เดือนนี้' },
  { key: 'all',       label: 'ทั้งหมด' },
]

export function inRange(date, range) {
  if (range === 'all') return true
  const d = daysSince(date)
  if (range === 'yesterday') return d === 1
  if (range === 'last7') return d >= 0 && d <= 7
  if (range === 'month') {
    const x = new Date(date), n = new Date()
    return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth()
  }
  return true
}

export function periodLabel(granularity, anchor) {
  if (granularity === 'all') return 'All time'
  const y = anchor.getFullYear()
  if (granularity === 'year') return `${y}`
  if (granularity === 'month') return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
  if (granularity === 'quarter') return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${y}`
  return ''
}

export function shiftAnchor(granularity, anchor, dir) {
  const d = new Date(anchor)
  if (granularity === 'year') d.setFullYear(d.getFullYear() + dir)
  else if (granularity === 'month') d.setMonth(d.getMonth() + dir)
  else if (granularity === 'quarter') d.setMonth(d.getMonth() + dir * 3)
  return d
}

// ── datetime-local <-> timestamptz ──────────────────────────────────────────
// Both directions go through local date parts so a retrospective entry typed
// as Thai wall-clock time is stored as that same instant.
export function toLocalInput(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(value) {
  if (!value) return null
  const [date, time] = value.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).toISOString()
}
