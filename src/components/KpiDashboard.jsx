import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

// ── Severe head detection (edit this list anytime) ───────────────────────────
const SEVERE_HEAD_KEYWORDS = [
  'head injury', 'severe head', 'head inj', 'sdh', 'edh',
  'subdural', 'epidural hematoma', 'traumatic brain', 'tbi',
  'brain injury', 'intracerebral', 'บาดเจ็บศีรษะ',
]
const isSevereHead = (c) => {
  const dx = (c.dx ?? '').toLowerCase()
  return SEVERE_HEAD_KEYWORDS.some((k) => dx.includes(k))
}

// ── KPI categories & targets (minutes) ───────────────────────────────────────
const KPI_CATEGORIES = [
  { key: 'severe', label: 'Severe Head Injury', target: 30,  accent: 'rose',   match: isSevereHead },
  { key: 'imm',    label: 'Immediate',          target: 30,  accent: 'red',    match: (c) => c.condition === 'Immediate' },
  { key: 'crit',   label: 'Critical',           target: 60,  accent: 'orange', match: (c) => c.condition === 'Critical' },
  { key: 'urg',    label: 'Urgency',            target: 360, accent: 'yellow', match: (c) => c.condition === 'Urgency' },
]

const DEPARTMENTS = ['Surgery', 'Orthopedic', 'Eye', 'ENT', 'OBGYN', 'Med']

// ── Helpers ──────────────────────────────────────────────────────────────────
function waitMinutes(c) {
  if (!c.on_case_at || !c.created_at) return null
  return (new Date(c.on_case_at) - new Date(c.created_at)) / 60000
}

function fmtMins(m) {
  if (m == null) return '—'
  const mins = Math.round(m)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

function median(arr) {
  if (arr.length === 0) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// All boundaries use LOCAL date methods (Thailand UTC+7) — never toISOString()
function inPeriod(date, granularity, anchor) {
  if (granularity === 'all') return true
  const d = new Date(date)
  if (granularity === 'year') {
    return d.getFullYear() === anchor.getFullYear()
  }
  if (granularity === 'month') {
    return d.getFullYear() === anchor.getFullYear() && d.getMonth() === anchor.getMonth()
  }
  if (granularity === 'quarter') {
    const q = Math.floor(d.getMonth() / 3)
    const aq = Math.floor(anchor.getMonth() / 3)
    return d.getFullYear() === anchor.getFullYear() && q === aq
  }
  return true
}

function periodLabel(granularity, anchor) {
  if (granularity === 'all') return 'All time'
  const y = anchor.getFullYear()
  if (granularity === 'year') return `${y}`
  if (granularity === 'month') {
    return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
  }
  if (granularity === 'quarter') return `Q${Math.floor(anchor.getMonth() / 3) + 1} ${y}`
  return ''
}

function shiftAnchor(granularity, anchor, dir) {
  const d = new Date(anchor)
  if (granularity === 'year') d.setFullYear(d.getFullYear() + dir)
  else if (granularity === 'month') d.setMonth(d.getMonth() + dir)
  else if (granularity === 'quarter') d.setMonth(d.getMonth() + dir * 3)
  return d
}

// Compliance color thresholds
function compColor(pct) {
  if (pct == null) return 'text-gray-500'
  if (pct >= 80) return 'text-green-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-red-400'
}
function compBar(pct) {
  if (pct == null) return 'bg-gray-600'
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-400'
  return 'bg-red-500'
}
// trend bars only — pass=green, fail=gray
function trendBar(pct) {
  if (pct == null) return 'bg-gray-700'
  if (pct >= 80) return 'bg-green-500'
  return 'bg-gray-600'
}
function trendColor(pct) {
  if (pct == null) return 'text-gray-600'
  if (pct >= 80) return 'text-green-400'
  return 'text-gray-400'
}

// Build trend sub-buckets for the selected granularity (grouped by created_at for KPI stats)
// Each bucket also carries its date range so the timeline can re-filter by on_case_at
function buildBuckets(granularity, anchor, cases) {
  const buckets = []
  if (granularity === 'all') {
    const years = [...new Set(cases.map((c) => new Date(c.created_at).getFullYear()))].sort()
    years.forEach((y) => buckets.push({
      label: `${y}`,
      dateFrom: new Date(y, 0, 1),
      dateTo:   new Date(y + 1, 0, 1),
      cases: cases.filter((c) => new Date(c.created_at).getFullYear() === y),
    }))
  } else if (granularity === 'year') {
    for (let m = 0; m < 12; m++) {
      buckets.push({
        label: new Date(anchor.getFullYear(), m, 1).toLocaleDateString([], { month: 'short' }),
        dateFrom: new Date(anchor.getFullYear(), m, 1),
        dateTo:   new Date(anchor.getFullYear(), m + 1, 1),
        cases: cases.filter((c) => {
          const d = new Date(c.created_at)
          return d.getFullYear() === anchor.getFullYear() && d.getMonth() === m
        }),
      })
    }
  } else if (granularity === 'quarter') {
    const q0 = Math.floor(anchor.getMonth() / 3) * 3
    for (let m = q0; m < q0 + 3; m++) {
      buckets.push({
        label: new Date(anchor.getFullYear(), m, 1).toLocaleDateString([], { month: 'short' }),
        dateFrom: new Date(anchor.getFullYear(), m, 1),
        dateTo:   new Date(anchor.getFullYear(), m + 1, 1),
        cases: cases.filter((c) => {
          const d = new Date(c.created_at)
          return d.getFullYear() === anchor.getFullYear() && d.getMonth() === m
        }),
      })
    }
  } else if (granularity === 'month') {
    const y = anchor.getFullYear(), m = anchor.getMonth()
    const days = new Date(y, m + 1, 0).getDate()
    for (let day = 1; day <= days; day++) {
      buckets.push({
        label: `${day}`,
        dateFrom: new Date(y, m, day),
        dateTo:   new Date(y, m, day + 1),
        cases: cases.filter((c) => {
          const d = new Date(c.created_at)
          return d.getFullYear() === y && d.getMonth() === m && d.getDate() === day
        }),
      })
    }
  }
  return buckets
}

// Overall compliance across all KPI categories for a set of cases
function overallCompliance(cases) {
  let met = 0, total = 0
  for (const c of cases) {
    const w = waitMinutes(c)
    if (w == null) continue
    // assign target by first matching category (severe head wins if matched)
    let target = null
    for (const cat of KPI_CATEGORIES) {
      if (cat.match(c)) { target = cat.target; break }
    }
    if (target == null) continue
    total++
    if (w <= target) met++
  }
  return total === 0 ? null : { pct: (met / total) * 100, met, total }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ cat, stat, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={stat.total === 0}
      className="text-left bg-gray-800 rounded-2xl p-5 border border-gray-700 hover:border-gray-500 disabled:hover:border-gray-700 disabled:cursor-default transition-colors w-full"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-white font-semibold text-sm leading-tight">{cat.label}</h3>
        <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full whitespace-nowrap">
          ≤ {fmtMins(cat.target)}
        </span>
      </div>
      {stat.total === 0 ? (
        <p className="text-gray-600 text-sm py-3">No cases in period</p>
      ) : (
        <>
          <div className="flex items-end gap-2 mb-1">
            <span className={`text-4xl font-bold font-mono ${compColor(stat.pct)}`}>
              {Math.round(stat.pct)}%
            </span>
            <span className="text-gray-500 text-xs mb-1.5">met target</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-3 overflow-hidden">
            <div className={`h-2 rounded-full ${compBar(stat.pct)}`} style={{ width: `${stat.pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{stat.met}/{stat.total} cases</span>
            <span>median {fmtMins(stat.med)}</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">คลิกเพื่อดูรายการเคส →</p>
        </>
      )}
    </button>
  )
}

function CaseListModal({ cat, rows, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-gray-900 w-full sm:max-w-5xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-bold">{cat.label}</h2>
            <p className="text-gray-400 text-xs">
              {rows.length} cases · target ≤ {fmtMins(cat.target)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
        </div>
        {/* list */}
        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <p className="text-gray-500 text-sm p-6 text-center">No cases</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">HN</th>
                  <th className="px-4 py-2.5 text-left">Diagnosis</th>
                  <th className="px-4 py-2.5 text-left">Operation</th>
                  <th className="px-4 py-2.5 text-right">Wait</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800">
                    <td className="px-4 py-2.5 font-mono text-blue-300 text-xs whitespace-nowrap">{r.hn ?? '—'}</td>
                    <td className="px-4 py-2.5 text-white">{r.dx ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400">{r.operation ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${r.met ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtMins(r.wait)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function BarRow({ label, pct, target, sub }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-300 font-medium">{label}</span>
        <span className={compColor(pct)}>{pct == null ? '—' : `${Math.round(pct)}%`} {sub && <span className="text-gray-500">· {sub}</span>}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
        <div className={`h-3 rounded-full ${compBar(pct)}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  )
}

const CONDITION_COLOR = {
  Immediate:    'bg-red-600',
  Critical:     'bg-orange-500',
  Urgency:      'bg-yellow-400',
  Expedited:    'bg-blue-500',
}
const CONDITION_TEXT = {
  Immediate:    'text-red-400',
  Critical:     'text-orange-400',
  Urgency:      'text-yellow-400',
  Expedited:    'text-blue-400',
}

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_TICKS = Array.from({ length: 13 }, (_, i) => i * 2) // 0,2,4,...,24

function timeFmt(ts, dayStart) {
  if (!ts) return ''
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const label = `${h}:${m}`
  const diff = Math.floor((new Date(ts).getTime() - dayStart) / DAY_MS)
  return diff > 0 ? `${label}(+${diff})` : label
}

// ── Day case list (popup when clicking a day) ─────────────────────────────────
function DayCasesModal({ dayLabel, cases, onClose }) {
  const sorted = [...cases]
    .filter((c) => c.on_case_at)
    .sort((a, b) => new Date(a.on_case_at) - new Date(b.on_case_at))

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-white font-bold">{dayLabel}</h3>
            <p className="text-gray-400 text-xs">{sorted.length} cases</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <p className="text-gray-500 text-sm p-6 text-center">No cases with OR start time</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">On case</th>
                  <th className="px-4 py-2.5 text-left">HN</th>
                  <th className="px-4 py-2.5 text-left">Diagnosis</th>
                  <th className="px-4 py-2.5 text-left">Operation</th>
                  <th className="px-4 py-2.5 text-right">Wait</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const wm = waitMinutes(c)
                  const target = c.condition === 'Immediate' ? 30 : c.condition === 'Critical' ? 60 : 360
                  const passed = wm != null && wm <= target
                  const dayStart = new Date(new Date(c.on_case_at).getFullYear(), new Date(c.on_case_at).getMonth(), new Date(c.on_case_at).getDate()).getTime()
                  return (
                    <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap font-mono">{timeFmt(c.on_case_at, dayStart)}</td>
                      <td className="px-4 py-2.5 font-mono text-blue-300 text-xs whitespace-nowrap">{c.hn ?? '—'}</td>
                      <td className="px-4 py-2.5 text-white">{c.dx ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 text-sm">{c.operation ?? '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-bold text-xs whitespace-nowrap ${passed ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtMins(wm)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Monthly Gantt timeline (horizontal scroll) ───────────────────────────────
const DOW   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PX_PER_HOUR = 60          // 60px per hour → 1440px per day
const LABEL_W     = 160         // px for left case-label column

function MonthlyTimelineModal({ allCases, onClose }) {
  const [monthAnchor, setMonthAnchor] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)

  const y = monthAnchor.getFullYear()
  const m = monthAnchor.getMonth()
  const daysInMonth  = new Date(y, m + 1, 0).getDate()
  const monthStart   = new Date(y, m, 1).getTime()
  const monthEnd     = new Date(y, m + 1, 1).getTime()
  const totalHours   = daysInMonth * 24
  const totalPx      = totalHours * PX_PER_HOUR

  const monthLabel = monthAnchor.toLocaleDateString([], { month: 'long', year: 'numeric' })

  // cases with on_case_at in this month, sorted by on_case_at
  const cases = useMemo(() => allCases
    .filter((c) => {
      if (!c.on_case_at) return false
      const t = new Date(c.on_case_at).getTime()
      return t >= monthStart && t < monthEnd
    })
    .sort((a, b) => new Date(a.on_case_at) - new Date(b.on_case_at)),
  [allCases, monthStart, monthEnd])

  // px position from a timestamp
  function toLeft(ts) {
    if (!ts) return null
    return ((new Date(ts).getTime() - monthStart) / (DAY_MS)) * PX_PER_HOUR * 24
  }

  // group cases by day for click targets
  const casesByDay = useMemo(() => {
    const map = {}
    cases.forEach((c) => {
      const d = new Date(c.on_case_at).getDate()
      if (!map[d]) map[d] = []
      map[d].push(c)
    })
    return map
  }, [cases])

  const COND_COLOR = {
    Immediate: 'bg-red-600',
    Critical:  'bg-orange-500',
    Urgency:   'bg-yellow-400',
    Expedited: 'bg-blue-500',
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900" onClick={onClose}>
      <div className="flex flex-col h-full" onClick={e => e.stopPropagation()}>

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-800 border-b border-gray-700 shrink-0 gap-3 flex-wrap">
          <h2 className="text-white font-bold text-lg">Monthly Timeline</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setMonthAnchor(new Date(y, m-1, 1))} className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 flex items-center justify-center">‹</button>
            <span className="text-white font-semibold min-w-[150px] text-center text-sm">{monthLabel} · {cases.length} cases</span>
            <button onClick={() => setMonthAnchor(new Date(y, m+1, 1))} className="w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 flex items-center justify-center">›</button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
        </div>

        {/* ── Scrollable area (both x and y) ── */}
        <div className="flex-1 overflow-auto">
          <div style={{ minWidth: LABEL_W + totalPx + 32 }}>

            {/* ── Day header row ── */}
            <div className="flex sticky top-0 z-10 bg-gray-900 border-b border-gray-700">
              <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="shrink-0 border-r border-gray-700 bg-gray-800" />
              <div className="relative bg-gray-800" style={{ width: totalPx }}>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day  = i + 1
                  const dow  = new Date(y, m, day).getDay()
                  const isWE = dow === 0 || dow === 6
                  const left = i * 24 * PX_PER_HOUR
                  return (
                    <div
                      key={day}
                      className={`absolute top-0 bottom-0 flex flex-col items-center justify-center border-r border-gray-700 ${isWE ? 'bg-gray-700/40' : ''}`}
                      style={{ left, width: 24 * PX_PER_HOUR }}
                    >
                      <span className={`text-xs font-bold ${isWE ? 'text-blue-400' : 'text-gray-300'}`}>
                        {day}
                      </span>
                      <span className="text-[10px] text-gray-500">{DOW[dow]}</span>
                      {/* click to see day cases */}
                      <button
                        onClick={() => setSelectedDay({
                          label: `${DOW[dow]} ${day} ${monthLabel}`,
                          cases: casesByDay[day] ?? [],
                        })}
                        className="absolute inset-0 hover:bg-white/5 transition-colors"
                      />
                    </div>
                  )
                })}
                {/* hour ticks every 6h */}
                {Array.from({ length: daysInMonth * 4 }, (_, i) => (
                  <div
                    key={`h${i}`}
                    className="absolute bottom-0 text-[9px] text-gray-700"
                    style={{ left: i * 6 * PX_PER_HOUR + 2 }}
                  >
                    {`${((i * 6) % 24).toString().padStart(2,'0')}h`}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Case rows ── */}
            {cases.length === 0 ? (
              <p className="text-gray-600 text-sm p-8 text-center">No cases with OR start time this month</p>
            ) : (
              cases.map((c) => {
                const left  = toLeft(c.on_case_at)
                const doneL = toLeft(c.done_at)
                const barW  = doneL != null && left != null
                  ? Math.max(doneL - left, 8)
                  : 8
                const wm     = waitMinutes(c)
                const target = c.condition === 'Immediate' ? 30 : c.condition === 'Critical' ? 60 : 360
                const passed = wm != null && wm <= target
                const color  = COND_COLOR[c.condition] ?? 'bg-gray-500'
                const dayRef = new Date(c.on_case_at)
                const ds     = new Date(dayRef.getFullYear(), dayRef.getMonth(), dayRef.getDate()).getTime()

                return (
                  <div
                    key={c.id}
                    className="flex border-b border-gray-800 hover:bg-gray-800/30 transition-colors"
                    style={{ height: 40 }}
                  >
                    {/* case label */}
                    <div
                      className="shrink-0 flex items-center gap-2 px-3 border-r border-gray-800 bg-gray-900"
                      style={{ width: LABEL_W, minWidth: LABEL_W }}
                    >
                      <span className="text-blue-300 font-mono text-[11px] whitespace-nowrap">{c.hn ?? '—'}</span>
                      <span className="text-gray-500 text-[10px] truncate flex-1" title={c.dx}>{c.dx ?? '—'}</span>
                      <span className={`text-[10px] font-mono font-bold whitespace-nowrap ${passed ? 'text-green-400' : 'text-red-400'}`}>
                        {fmtMins(wm)}
                      </span>
                    </div>

                    {/* timeline track */}
                    <div className="relative flex-1" style={{ width: totalPx }}>
                      {/* day dividers */}
                      {Array.from({ length: daysInMonth }, (_, i) => (
                        <div
                          key={i}
                          className={`absolute top-0 bottom-0 border-r ${i % 7 === 6 || i % 7 === 5 ? 'border-gray-700/50 bg-gray-800/20' : 'border-gray-800'}`}
                          style={{ left: i * 24 * PX_PER_HOUR, width: 24 * PX_PER_HOUR }}
                        />
                      ))}

                      {/* case bar */}
                      {left != null && (
                        <div
                          className={`absolute top-2 bottom-2 ${color} rounded opacity-85`}
                          style={{ left, width: barW }}
                          title={`${timeFmt(c.on_case_at, ds)} → ${timeFmt(c.done_at, ds)}\n${c.dx}`}
                        />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-800 border-t border-gray-700 shrink-0 flex-wrap text-[11px] text-gray-500">
          {Object.entries({ Immediate:'bg-red-600', Critical:'bg-orange-500', Urgency:'bg-yellow-400', Expedited:'bg-blue-500' }).map(([k,c]) => (
            <span key={k} className="flex items-center gap-1.5"><span className={`w-5 h-2.5 ${c} rounded-sm inline-block`}/>{k}</span>
          ))}
          <span className="ml-auto">คลิกวันที่ในหัวตารางเพื่อดูรายการเคส</span>
        </div>
      </div>

      {/* day popup */}
      {selectedDay && (
        <DayCasesModal
          dayLabel={selectedDay.label}
          cases={selectedDay.cases}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}

function TrendBars({ buckets, granularity, onDayClick, allCases }) {
  const active = buckets.filter((b) => b.cases.length > 0)
  if (active.length === 0) return <p className="text-gray-600 text-sm">No data in this period</p>

  const CHART_H = 160

  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ minWidth: active.length * 56 }}>
        {/* 80% reference line */}
        <div
          className="absolute left-0 right-0 border-t border-dashed border-green-600/50 flex items-center"
          style={{ top: CHART_H - CHART_H * 0.8 }}
        >
          <span className="text-[10px] text-green-600 bg-gray-800 px-1 -mt-2.5 ml-1 whitespace-nowrap">80%</span>
        </div>

        {/* bars */}
        <div className="flex items-end gap-2 pb-1" style={{ height: CHART_H + 52 }}>
          {active.map((b, i) => {
            const comp = overallCompliance(b.cases)
            const pct = comp?.pct ?? 0
            const barH = Math.max(pct * CHART_H / 100, 4)
            return (
              <button
                key={i}
                onClick={() => {
                  // filter ALL cases by on_case_at falling in this bucket's date range
                  const timelineCases = allCases.filter((c) => {
                    if (!c.on_case_at) return false
                    const t = new Date(c.on_case_at).getTime()
                    return t >= b.dateFrom.getTime() && t < b.dateTo.getTime()
                  })
                  onDayClick({ ...b, cases: timelineCases })
                }}
                className="flex flex-col items-center group hover:opacity-80 transition-opacity"
                style={{ minWidth: 48 }}
                title={`คลิกดูรายการเคส ${b.label}`}
              >
                <span className={`text-xs font-bold mb-1 ${trendColor(comp?.pct ?? null)}`}>
                  {comp ? `${Math.round(pct)}%` : ''}
                </span>
                <div className="relative flex flex-col justify-end" style={{ height: CHART_H }}>
                  <div
                    className={`w-10 rounded-t transition-all group-hover:ring-2 ring-white/30 ${trendBar(comp?.pct ?? null)}`}
                    style={{ height: barH }}
                  />
                </div>
                <span className="text-xs text-gray-400 font-medium mt-1">{b.label}</span>
                <span className="text-[10px] text-gray-500">{b.cases.length} cases</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* legend */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> ≥80% ผ่านเกณฑ์</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-600 inline-block" /> &lt;80% ไม่ผ่าน</span>
      </div>

    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function KpiDashboard() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [granularity, setGranularity] = useState('all')
  const [anchor, setAnchor] = useState(new Date())
  const [selectedCat, setSelectedCat] = useState(null)
  const [showTimeline, setShowTimeline] = useState(false)

  useEffect(() => {
    async function fetchAll() {
      let all = []
      let from = 0
      const page = 1000
      // paginate until short page
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('or_cases')
          .select('id, hn, created_at, on_case_at, done_at, condition, dx, operation, department, subtype')
          .eq('status', 'Done')
          .order('created_at', { ascending: true })
          .range(from, from + page - 1)
        if (error) { setError('Failed to load data.'); break }
        all = all.concat(data)
        if (data.length < page) break
        from += page
      }
      setCases(all)
      setLoading(false)
    }
    fetchAll()
  }, [])

  // cases within selected period
  const periodCases = useMemo(
    () => cases.filter((c) => inPeriod(c.created_at, granularity, anchor)),
    [cases, granularity, anchor],
  )

  // per-category stats
  const catStats = useMemo(() => {
    return KPI_CATEGORIES.map((cat) => {
      const matched = periodCases.filter((c) => cat.match(c))
      const waits = matched.map(waitMinutes).filter((w) => w != null)
      const met = waits.filter((w) => w <= cat.target).length
      return {
        cat,
        total: waits.length,
        met,
        pct: waits.length === 0 ? null : (met / waits.length) * 100,
        med: median(waits),
      }
    })
  }, [periodCases])

  const buckets = useMemo(
    () => buildBuckets(granularity, anchor, cases),
    [granularity, anchor, cases],
  )

  const deptStats = useMemo(() => {
    const counts = {}
    periodCases.forEach((c) => {
      if (c.department) counts[c.department] = (counts[c.department] ?? 0) + 1
    })
    const max = Math.max(1, ...Object.values(counts))
    return DEPARTMENTS.map((d) => ({ dept: d, count: counts[d] ?? 0, max }))
  }, [periodCases])

  const excludedCount = periodCases.filter((c) => waitMinutes(c) == null).length

  // rows for the drill-down modal (sorted slowest-first)
  const modalRows = useMemo(() => {
    if (!selectedCat) return []
    return periodCases
      .filter((c) => selectedCat.match(c))
      .map((c) => {
        const w = waitMinutes(c)
        return { ...c, wait: w, met: w != null && w <= selectedCat.target }
      })
      .filter((r) => r.wait != null)
      .sort((a, b) => b.wait - a.wait)
  }, [selectedCat, periodCases])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-wide">CMU OR · KPI Waiting Time</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                Time from received → OR start · Done cases only
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTimeline(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Timeline
              </button>
              <div className="text-right">
                <p className="text-gray-500 text-xs">Showing</p>
                <p className="text-white font-semibold text-sm">
                  {periodLabel(granularity, anchor)} · {periodCases.length} cases
                </p>
              </div>
            </div>
          </div>

          {/* Period controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
              {[
                { k: 'all', l: 'All time' },
                { k: 'year', l: 'Year' },
                { k: 'quarter', l: 'Quarter' },
                { k: 'month', l: 'Month' },
              ].map(({ k, l }) => (
                <button
                  key={k}
                  onClick={() => setGranularity(k)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    granularity === k ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            {granularity !== 'all' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAnchor((a) => shiftAnchor(granularity, a, -1))}
                  className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300"
                >
                  ‹
                </button>
                <span className="text-sm font-semibold min-w-[120px] text-center">
                  {periodLabel(granularity, anchor)}
                </span>
                <button
                  onClick={() => setAnchor((a) => shiftAnchor(granularity, a, 1))}
                  className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading analytics…</div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {catStats.map((s) => (
                <KpiCard
                  key={s.cat.key}
                  cat={s.cat}
                  stat={s}
                  onClick={() => setSelectedCat(s.cat)}
                />
              ))}
            </div>

            {/* Compliance bar chart */}
            <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-8">
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-4">
                Compliance by category
              </h2>
              {catStats.map((s) => (
                <BarRow
                  key={s.cat.key}
                  label={`${s.cat.label} (≤ ${fmtMins(s.cat.target)})`}
                  pct={s.pct}
                  sub={`${s.met}/${s.total}`}
                />
              ))}
            </section>

            {/* Trend over time */}
            <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-8">
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-1">
                Overall compliance trend
              </h2>
              <p className="text-gray-500 text-xs mb-4">
                {granularity === 'all' ? 'By year' :
                 granularity === 'year' ? 'By month' :
                 granularity === 'quarter' ? 'By month' : 'By day'}
                {' '}· bar height = % met target
              </p>
              {buckets.length === 0 ? (
                <p className="text-gray-600 text-sm">No data</p>
              ) : (
                <TrendBars buckets={buckets} granularity={granularity} onDayClick={() => {}} allCases={cases} />
              )}
            </section>

            {/* Department breakdown */}
            <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-8">
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-4">
                Volume by department
              </h2>
              {deptStats.every((d) => d.count === 0) ? (
                <p className="text-gray-600 text-sm">No department data in period</p>
              ) : (
                deptStats.map((d) => (
                  <div key={d.dept} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300 font-medium">{d.dept}</span>
                      <span className="text-gray-400">{d.count}</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-3 rounded-full bg-indigo-500"
                        style={{ width: `${(d.count / d.max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </section>

            {excludedCount > 0 && (
              <p className="text-center text-gray-600 text-xs">
                {excludedCount} case{excludedCount !== 1 ? 's' : ''} excluded (no OR start time recorded)
              </p>
            )}
          </>
        )}
      </main>

      {selectedCat && (
        <CaseListModal
          cat={selectedCat}
          rows={modalRows}
          onClose={() => setSelectedCat(null)}
        />
      )}

      {showTimeline && (
        <MonthlyTimelineModal
          allCases={cases}
          onClose={() => setShowTimeline(false)}
        />
      )}
    </div>
  )
}
