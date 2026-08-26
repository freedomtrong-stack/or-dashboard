import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// An "idle gap" = a stretch where NO case was in the OR, yet at least one case
// had already been received and was still waiting for its turn.
const GAP_MIN_MS = 120 * 60 * 1000 // 2 hours

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

// All boundaries use LOCAL date methods (Thailand UTC+7) — never toISOString()
function inPeriod(date, granularity, anchor) {
  if (granularity === 'all') return true
  const d = new Date(date)
  if (granularity === 'year') return d.getFullYear() === anchor.getFullYear()
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

// ── Gap computation ──────────────────────────────────────────────────────────
function computeIdleGaps(cases) {
  const t = (s) => new Date(s).getTime()

  // busy intervals, merged so overlapping/parallel cases count as one block
  const intervals = cases
    .filter((c) => c.on_case_at && c.done_at && t(c.done_at) > t(c.on_case_at))
    .map((c) => [t(c.on_case_at), t(c.done_at)])
    .sort((a, b) => a[0] - b[0])

  const busy = []
  for (const [s, e] of intervals) {
    const last = busy[busy.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else busy.push([s, e])
  }

  const gaps = []
  for (let i = 0; i < busy.length - 1; i++) {
    const start = busy[i][1]
    const end = busy[i + 1][0]
    if (end - start < GAP_MIN_MS) continue
    // cases already received before the gap that only started after it ended
    const waiting = cases.filter(
      (c) => c.on_case_at && t(c.created_at) <= start && t(c.on_case_at) >= end,
    )
    if (waiting.length === 0) continue
    gaps.push({
      start,
      end,
      mins: Math.round((end - start) / 60000),
      waiting: waiting
        .map((c) => ({ ...c, wait: waitMinutes(c) }))
        .sort((a, b) => (b.wait ?? 0) - (a.wait ?? 0)),
    })
  }
  return gaps
}

// minutes of idle-with-backlog falling in each hour of the day (local time)
function gapHourHistogram(gaps) {
  const hours = new Array(24).fill(0)
  const STEP = 15 * 60000
  for (const g of gaps) {
    for (let ts = g.start; ts < g.end; ts += STEP) {
      hours[new Date(ts).getHours()] += 15
    }
  }
  return hours
}

function fmtGapRange(start, end) {
  const s = new Date(start)
  const e = new Date(end)
  const hm = (d) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const day = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate()
  return sameDay
    ? `${day(s)}  ${hm(s)} – ${hm(e)}`
    : `${day(s)} ${hm(s)} – ${day(e)} ${hm(e)}`
}

// ── Sub-components ───────────────────────────────────────────────────────────
function GapHourChart({ hours }) {
  const max = Math.max(1, ...hours)
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-[3px] h-48 min-w-[560px]">
        {hours.map((mins, h) => {
          const hrs = mins / 60
          const pct = (mins / max) * 100
          const peak = pct >= 60
          return (
            <div key={h} className="flex-1 flex flex-col items-center justify-end h-full group">
              <span className="text-[10px] text-gray-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {hrs.toFixed(1)}h
              </span>
              <div
                className={`w-full rounded-t transition-colors ${
                  peak ? 'bg-red-500 group-hover:bg-red-400' : 'bg-gray-600 group-hover:bg-gray-500'
                }`}
                style={{ height: `${Math.max(pct, 1.5)}%` }}
              />
              <span className="text-[9px] text-gray-500 mt-1 font-mono">
                {String(h).padStart(2, '0')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GapCasesModal({ gap, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-white font-bold">OR idle {fmtMins(gap.mins)}</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {fmtGapRange(gap.start, gap.end)} · {gap.waiting.length} case
              {gap.waiting.length !== 1 ? 's' : ''} waiting throughout
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left">HN</th>
                <th className="px-4 py-2.5 text-left">Condition</th>
                <th className="px-4 py-2.5 text-left">Diagnosis</th>
                <th className="px-4 py-2.5 text-left">Operation</th>
                <th className="px-4 py-2.5 text-right">Total wait</th>
              </tr>
            </thead>
            <tbody>
              {gap.waiting.map((c) => (
                <tr key={c.id} className="border-b border-gray-800">
                  <td className="px-4 py-2.5 font-mono text-blue-300 text-xs">{c.hn ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-300 text-xs">{c.condition}</td>
                  <td className="px-4 py-2.5 text-white">{c.dx ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{c.operation ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-yellow-400 text-xs">
                    {c.wait == null ? '—' : fmtMins(c.wait)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function IdleGapDashboard() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [granularity, setGranularity] = useState('all')
  const [anchor, setAnchor] = useState(new Date())
  const [selectedGap, setSelectedGap] = useState(null)

  useEffect(() => {
    async function fetchAll() {
      let all = []
      let from = 0
      const page = 1000
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('or_cases')
          .select('id, hn, created_at, on_case_at, done_at, condition, dx, operation, department')
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

  const gaps = useMemo(() => computeIdleGaps(cases), [cases])
  const periodGaps = useMemo(
    () => gaps.filter((g) => inPeriod(new Date(g.start), granularity, anchor)),
    [gaps, granularity, anchor],
  )
  const gapHours = useMemo(() => gapHourHistogram(periodGaps), [periodGaps])
  const totalMins = periodGaps.reduce((s, g) => s + g.mins, 0)
  const worstHour = gapHours.indexOf(Math.max(...gapHours))
  const totalWaitingCases = periodGaps.reduce((s, g) => s + g.waiting.length, 0)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-wide">CMU OR · Idle Gap Analysis</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                OR empty ≥ 2 h while received cases were still waiting
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/kpi"
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                KPI page
              </Link>
              <div className="text-right">
                <p className="text-gray-500 text-xs">Showing</p>
                <p className="text-white font-semibold text-sm">
                  {periodLabel(granularity, anchor)} · {periodGaps.length} gaps
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
          <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
        ) : periodGaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No idle gaps found</p>
            <p className="text-sm mt-1">No stretch of ≥ 2 h with cases left waiting in this period</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Gaps found</p>
                <p className="text-3xl font-bold text-white mt-1">{periodGaps.length}</p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Total idle time</p>
                <p className="text-3xl font-bold text-red-400 mt-1">
                  {(totalMins / 60).toFixed(0)}
                  <span className="text-base font-semibold text-gray-500 ml-1">h</span>
                </p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Peak hour</p>
                <p className="text-3xl font-bold text-yellow-400 mt-1 font-mono">
                  {String(worstHour).padStart(2, '0')}:00
                </p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Cases held up</p>
                <p className="text-3xl font-bold text-orange-400 mt-1">{totalWaitingCases}</p>
              </div>
            </div>

            {/* Hour-of-day chart */}
            <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-8">
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-1">
                When does it happen?
              </h2>
              <p className="text-gray-500 text-xs mb-5">
                Idle hours by time of day · red = worst windows
              </p>
              <GapHourChart hours={gapHours} />
            </section>

            {/* Gap list */}
            <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-8">
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-1">
                Longest gaps
              </h2>
              <p className="text-gray-500 text-xs mb-4">Click a row to see the waiting cases</p>
              <div className="space-y-1.5">
                {[...periodGaps]
                  .sort((a, b) => b.mins - a.mins)
                  .map((g) => (
                    <button
                      key={g.start}
                      onClick={() => setSelectedGap(g)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-700 transition-colors text-left"
                    >
                      <span className="text-gray-300 text-xs font-mono w-44 shrink-0">
                        {fmtGapRange(g.start, g.end)}
                      </span>
                      <span className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <span
                          className="block h-2 bg-red-500 rounded-full"
                          style={{ width: `${Math.min(100, (g.mins / (12 * 60)) * 100)}%` }}
                        />
                      </span>
                      <span className="text-red-400 font-semibold text-xs w-16 text-right shrink-0">
                        {fmtMins(g.mins)}
                      </span>
                      <span className="text-gray-400 text-xs w-20 text-right shrink-0">
                        {g.waiting.length} waiting
                      </span>
                    </button>
                  ))}
              </div>
            </section>

            <p className="text-center text-gray-600 text-xs">
              OR busy = any case with status Done between its on-case and done time.
              The database has no room column, so parallel rooms count as one OR.
            </p>
          </>
        )}
      </main>

      {selectedGap && (
        <GapCasesModal gap={selectedGap} onClose={() => setSelectedGap(null)} />
      )}
    </div>
  )
}
