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

// Build trend sub-buckets for the selected granularity
function buildBuckets(granularity, anchor, cases) {
  // returns [{ label, cases: [] }]
  const buckets = []
  if (granularity === 'all') {
    const years = [...new Set(cases.map((c) => new Date(c.created_at).getFullYear()))].sort()
    years.forEach((y) => buckets.push({
      label: `${y}`,
      cases: cases.filter((c) => new Date(c.created_at).getFullYear() === y),
    }))
  } else if (granularity === 'year') {
    for (let m = 0; m < 12; m++) {
      buckets.push({
        label: new Date(anchor.getFullYear(), m, 1).toLocaleDateString([], { month: 'short' }),
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
function KpiCard({ cat, stat }) {
  return (
    <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
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
        </>
      )}
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

function TrendBars({ buckets }) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.cases.length))
  return (
    <div className="flex items-end gap-1 h-48 overflow-x-auto pb-1">
      {buckets.map((b, i) => {
        const comp = overallCompliance(b.cases)
        const heightPct = comp ? comp.pct : 0
        return (
          <div key={i} className="flex flex-col items-center justify-end flex-1 min-w-[28px] group relative">
            {/* tooltip */}
            <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition bg-black text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
              {comp ? `${Math.round(comp.pct)}% · ${comp.met}/${comp.total}` : 'no data'}
            </div>
            <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
              <div
                className={`w-full rounded-t ${compBar(comp?.pct ?? null)} transition-all`}
                style={{ height: `${comp ? Math.max(heightPct, 2) : 0}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-500 mt-1 truncate w-full text-center">{b.label}</span>
            <span className="text-[9px] text-gray-600">{b.cases.length || ''}</span>
          </div>
        )
      })}
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
          .select('created_at, on_case_at, condition, dx, department, subtype')
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
            <div className="text-right">
              <p className="text-gray-500 text-xs">Showing</p>
              <p className="text-white font-semibold text-sm">
                {periodLabel(granularity, anchor)} · {periodCases.length} cases
              </p>
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
                <KpiCard key={s.cat.key} cat={s.cat} stat={s} />
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
                <TrendBars buckets={buckets} />
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
    </div>
  )
}
