import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AnalyticsNav from './AnalyticsNav'
import {
  PRIORITIES, PRIORITY_BY_KEY, priorityLabel, timings, isDelayed,
  fmtMins, median, quantile, inPeriod, periodLabel, shiftAnchor,
} from '../lib/orKpi'

const TABS = [
  { k: 'overview',  l: 'Overview' },
  { k: 'timeliness', l: 'Timeliness' },
  { k: 'delay',     l: 'Delay Drivers' },
  { k: 'trend',     l: 'Daily / Monthly' },
  { k: 'cases',     l: 'Case Drill-down' },
]

const pctColor = (p) => p == null ? 'text-gray-500' : p >= 80 ? 'text-green-400' : p >= 50 ? 'text-yellow-400' : 'text-red-400'
const pctBar   = (p) => p == null ? 'bg-gray-600'  : p >= 80 ? 'bg-green-500'  : p >= 50 ? 'bg-yellow-400' : 'bg-red-500'

function Stat({ label, value, sub, tone = 'text-white' }) {
  return (
    <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${tone}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function Bar({ label, value, max, sub, cls = 'bg-indigo-500', onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`w-full block mb-3 text-left ${onClick ? 'hover:opacity-80 transition-opacity' : ''}`}>
      <div className="flex justify-between text-xs mb-1 gap-3">
        <span className="text-gray-300 font-medium truncate">{label}</span>
        <span className="text-gray-400 font-mono shrink-0">{sub}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
        <div className={`h-3 rounded-full ${cls}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
    </Tag>
  )
}

// Median duration of each leg, so the bottleneck is visible at a glance.
function StageBreakdown({ rows }) {
  const legs = [
    { key: 'setToAccept',       label: 'Set → Accept',      cls: 'bg-sky-500',    hint: 'ห้องผ่าตัดตอบรับเคส' },
    { key: 'acceptToArrival',   label: 'Accept → Arrival',  cls: 'bg-violet-500', hint: 'เคลื่อนย้ายผู้ป่วยมาถึงห้อง' },
    { key: 'arrivalToIncision', label: 'Arrival → Incision', cls: 'bg-teal-500',  hint: 'กระบวนการภายในห้อง' },
  ]
  const vals = legs.map((l) => ({ ...l, med: median(rows.map((t) => t[l.key])), n: rows.filter((t) => t[l.key] != null).length }))
  const max = Math.max(1, ...vals.map((v) => v.med ?? 0))

  return (
    <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-6">
      <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-1">แต่ละช่วงใช้เวลาเท่าไร</h2>
      <p className="text-gray-500 text-xs mb-4">ค่ามัธยฐานของแต่ละช่วง · ช่วงที่ยาวที่สุดคือคอขวด</p>
      {vals.map((v) => (
        <div key={v.key} className="mb-4 last:mb-0">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-300 font-medium">{v.label} <span className="text-gray-600">· {v.hint}</span></span>
            <span className="text-gray-400 font-mono">{fmtMins(v.med)} <span className="text-gray-600">({v.n} เคส)</span></span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div className={`h-3 rounded-full ${v.cls}`} style={{ width: `${((v.med ?? 0) / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {vals.every((v) => v.n === 0) && (
        <p className="text-amber-400/80 text-xs mt-2">
          ยังไม่มีข้อมูล Accept / Incision — กรอกได้ที่หน้า Backfill
        </p>
      )}
    </section>
  )
}

export default function OrReport() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const [granularity, setGranularity] = useState('all')
  const [anchor, setAnchor] = useState(new Date())
  const [focusPriority, setFocusPriority] = useState(null)

  useEffect(() => {
    async function fetchAll() {
      let all = []
      let from = 0
      const page = 1000
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('or_cases')
          .select('*')
          .eq('status', 'Done')
          .order('created_at', { ascending: true })
          .range(from, from + page - 1)
        if (error) {
          setError(error.message.includes('column')
            ? 'ยังไม่ได้รัน SQL เพิ่มคอลัมน์ — ดูคำสั่งในแชท'
            : error.message)
          break
        }
        all = all.concat(data)
        if (data.length < page) break
        from += page
      }
      setCases(all)
      setLoading(false)
    }
    fetchAll()
  }, [])

  const scope = useMemo(() => {
    const inRange = cases.filter((c) => inPeriod(c.created_at, granularity, anchor))
    return focusPriority ? inRange.filter((c) => c.condition === focusPriority) : inRange
  }, [cases, granularity, anchor, focusPriority])

  const withTimings = useMemo(() => scope.map((c) => ({ c, t: timings(c) })), [scope])
  const judged = withTimings.filter((r) => r.t.status !== 'No target')
  const onTime = judged.filter((r) => r.t.status === 'On-time')
  const delayed = judged.filter((r) => r.t.status === 'Delayed')
  const compliance = judged.length ? (onTime.length / judged.length) * 100 : null
  const approxCount = withTimings.filter((r) => r.t.approximate && r.t.setToArrival != null).length
  const documented = delayed.filter((r) => r.c.delay_reason).length

  // per-priority table
  const byPriority = useMemo(() => PRIORITIES.map((p) => {
    const rows = withTimings.filter((r) => r.c.condition === p.key)
    const j = rows.filter((r) => r.t.status !== 'No target')
    const met = j.filter((r) => r.t.status === 'On-time').length
    const waits = rows.map((r) => r.t.setToArrival)
    return {
      p, n: rows.length, judged: j.length, met,
      pct: j.length ? (met / j.length) * 100 : null,
      median: median(waits), p90: quantile(waits, 0.9),
    }
  }), [withTimings])

  // delay drivers
  const delayReasons = useMemo(() => {
    const m = {}
    delayed.forEach((r) => {
      const k = r.c.delay_reason ?? '(ยังไม่ได้กรอก)'
      ;(m[k] ??= { n: 0, mins: 0 })
      m[k].n++
      m[k].mins += r.t.delayMin ?? 0
    })
    return Object.entries(m).map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.n - a.n)
  }, [delayed])

  const delayOwners = useMemo(() => {
    const m = {}
    delayed.forEach((r) => {
      const k = r.c.delay_process_owner ?? '(ยังไม่ได้กรอก)'
      ;(m[k] ??= { n: 0, mins: 0 })
      m[k].n++
      m[k].mins += r.t.delayMin ?? 0
    })
    return Object.entries(m).map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.n - a.n)
  }, [delayed])

  // trend buckets
  const buckets = useMemo(() => {
    const m = {}
    withTimings.forEach((r) => {
      const d = new Date(r.c.created_at)
      const key = granularity === 'month'
        ? `${d.getDate()}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      ;(m[key] ??= []).push(r)
    })
    return Object.entries(m)
      .map(([label, rows]) => {
        const j = rows.filter((r) => r.t.status !== 'No target')
        const met = j.filter((r) => r.t.status === 'On-time').length
        return { label, n: rows.length, judged: j.length, pct: j.length ? (met / j.length) * 100 : null }
      })
      .sort((a, b) => granularity === 'month' ? +a.label - +b.label : a.label.localeCompare(b.label))
  }, [withTimings, granularity])

  const drill = useMemo(
    () => [...withTimings].sort((a, b) => (b.t.delayMin ?? -1) - (a.t.delayMin ?? -1)).slice(0, 200),
    [withTimings],
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-wide">CMU OR · Emergency Timeliness Report</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                Set → Accept → Arrival OR → Incision · KPI หลักคือ Set → Arrival · เฉพาะเคส Done
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AnalyticsNav />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap mb-3">
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
              {[{ k: 'all', l: 'All time' }, { k: 'year', l: 'Year' }, { k: 'quarter', l: 'Quarter' }, { k: 'month', l: 'Month' }].map(({ k, l }) => (
                <button key={k} onClick={() => setGranularity(k)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    granularity === k ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>{l}</button>
              ))}
            </div>
            {granularity !== 'all' && (
              <div className="flex items-center gap-2">
                <button onClick={() => setAnchor((a) => shiftAnchor(granularity, a, -1))}
                  className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300">‹</button>
                <span className="text-sm font-semibold min-w-[120px] text-center">{periodLabel(granularity, anchor)}</span>
                <button onClick={() => setAnchor((a) => shiftAnchor(granularity, a, 1))}
                  className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300">›</button>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap ml-auto">
              <button onClick={() => setFocusPriority(null)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${focusPriority === null ? 'bg-teal-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
                ทุกระดับ
              </button>
              {PRIORITIES.map((p) => (
                <button key={p.key} onClick={() => setFocusPriority(focusPriority === p.key ? null : p.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${focusPriority === p.key ? 'bg-teal-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
                  {p.level} {p.key}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 border-b border-gray-700 -mb-4 overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.k ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
                }`}>{t.l}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
        ) : scope.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">ไม่มีเคสในช่วงนี้</div>
        ) : (
          <>
            {approxCount > 0 && (
              <div className="bg-amber-950/40 border border-amber-800/60 text-amber-200 px-4 py-3 rounded-xl mb-6 text-sm">
                ⚠️ {approxCount} เคสยังไม่มีเวลา Arrival ที่ยืนยัน — ใช้ค่า on_case_at เดิมแทน
                ซึ่งคนกรอกตีความต่างกัน (บ้างหมายถึงถึงห้อง บ้างหมายถึงลงมีด)
                ตัวเลข KPI จึงเป็นค่าประมาณ · ยืนยันได้ที่หน้า{' '}
                <Link to="/backfill" className="underline font-semibold">Backfill</Link>
              </div>
            )}

            {/* ── Overview ── */}
            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Stat label="เคสทั้งหมด" value={scope.length} />
                  <Stat label="On-time" value={onTime.length} tone="text-green-400" sub={`จาก ${judged.length} เคสที่มีเป้า`} />
                  <Stat label="Delayed" value={delayed.length} tone="text-red-400" sub={`กรอกเหตุผลแล้ว ${documented}`} />
                  <Stat label="Compliance" value={compliance == null ? '—' : `${Math.round(compliance)}%`} tone={pctColor(compliance)} />
                </div>

                <StageBreakdown rows={withTimings.map((r) => r.t)} />

                <section className="bg-gray-800 rounded-2xl border border-gray-700 overflow-x-auto mb-6">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
                        <th className="px-4 py-3 text-left">Priority</th>
                        <th className="px-4 py-3 text-right">Target</th>
                        <th className="px-4 py-3 text-right">เคส</th>
                        <th className="px-4 py-3 text-right">Median Set→Arrival</th>
                        <th className="px-4 py-3 text-right">P90</th>
                        <th className="px-4 py-3 text-right">Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPriority.map((r) => (
                        <tr key={r.p.key} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/40">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${r.p.color}`}>
                              {r.p.level} {r.p.key}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">
                            {r.p.target ? `≤ ${fmtMins(r.p.target)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-300">{r.n}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-300 text-xs">{fmtMins(r.median)}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">{fmtMins(r.p90)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`font-mono font-bold ${pctColor(r.pct)}`}>
                                {r.pct == null ? '—' : `${Math.round(r.pct)}%`}
                              </span>
                              <span className="hidden sm:block w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <span className={`block h-1.5 rounded-full ${pctBar(r.pct)}`} style={{ width: `${r.pct ?? 0}%` }} />
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}

            {/* ── Timeliness ── */}
            {tab === 'timeliness' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Stat label="Median Set→Arrival" value={fmtMins(median(withTimings.map((r) => r.t.setToArrival)))} />
                  <Stat label="P90 Set→Arrival" value={fmtMins(quantile(withTimings.map((r) => r.t.setToArrival), 0.9))} tone="text-orange-400" />
                  <Stat label="Median Set→Accept" value={fmtMins(median(withTimings.map((r) => r.t.setToAccept)))} tone="text-sky-400" />
                  <Stat label="Median Arrival→Incision" value={fmtMins(median(withTimings.map((r) => r.t.arrivalToIncision)))} tone="text-teal-400" />
                </div>
                <StageBreakdown rows={withTimings.map((r) => r.t)} />
                <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
                  <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-4">Compliance รายระดับ</h2>
                  {byPriority.filter((r) => r.judged > 0).map((r) => (
                    <Bar key={r.p.key} label={`${r.p.level} ${r.p.key} (≤ ${fmtMins(r.p.target)})`}
                      value={r.pct ?? 0} max={100} sub={`${r.met}/${r.judged} · ${Math.round(r.pct ?? 0)}%`}
                      cls={pctBar(r.pct)} />
                  ))}
                </section>
              </>
            )}

            {/* ── Delay Drivers ── */}
            {tab === 'delay' && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <Stat label="เคสล่าช้า" value={delayed.length} tone="text-red-400" />
                  <Stat label="กรอกเหตุผลแล้ว" value={documented} tone="text-green-400"
                    sub={delayed.length ? `${Math.round((documented / delayed.length) * 100)}% ของเคสล่าช้า` : null} />
                  <Stat label="นาทีที่เกินเป้า รวม" value={`${Math.round(delayed.reduce((s, r) => s + (r.t.delayMin ?? 0), 0) / 60)}h`} tone="text-orange-400" />
                  <Stat label="เกินเป้าเฉลี่ย" value={fmtMins(median(delayed.map((r) => r.t.delayMin)))} tone="text-orange-400" />
                </div>

                {documented === 0 ? (
                  <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700 text-center">
                    <p className="text-gray-300 font-medium">ยังไม่มีเคสไหนกรอกเหตุผลความล่าช้า</p>
                    <p className="text-gray-500 text-sm mt-1 mb-4">
                      หน้านี้จะมีข้อมูลเมื่อกรอกเหตุผลให้เคสที่ล่าช้าแล้ว
                    </p>
                    <Link to="/backfill" className="inline-block bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-semibold">
                      ไปหน้า Backfill
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
                      <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-4">Top delay reasons</h2>
                      {delayReasons.map((d) => (
                        <Bar key={d.reason} label={d.reason} value={d.n}
                          max={Math.max(...delayReasons.map((x) => x.n))}
                          sub={`${d.n} เคส · รวม ${Math.round(d.mins / 60)}h`}
                          cls={d.reason.startsWith('(') ? 'bg-gray-600' : 'bg-red-500'} />
                      ))}
                    </section>
                    <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
                      <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-1">ตามกระบวนการ / ทีม</h2>
                      <p className="text-gray-500 text-xs mb-4">ใช้วิเคราะห์เชิงระบบ ไม่ใช่ระบุความผิดรายบุคคล</p>
                      {delayOwners.map((d) => (
                        <Bar key={d.owner} label={d.owner} value={d.n}
                          max={Math.max(...delayOwners.map((x) => x.n))}
                          sub={`${d.n} เคส · รวม ${Math.round(d.mins / 60)}h`}
                          cls={d.owner.startsWith('(') ? 'bg-gray-600' : 'bg-amber-500'} />
                      ))}
                    </section>
                  </div>
                )}
              </>
            )}

            {/* ── Trend ── */}
            {tab === 'trend' && (
              <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
                <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest mb-1">
                  Compliance {granularity === 'month' ? 'รายวัน' : 'รายเดือน'}
                </h2>
                <p className="text-gray-500 text-xs mb-5">ความสูงของแท่ง = % เคสที่ถึงห้องทันเป้า</p>
                <div className="overflow-x-auto">
                  <div className="flex items-end gap-2 h-56" style={{ minWidth: buckets.length * 46 }}>
                    {buckets.map((b) => (
                      <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full group" style={{ minWidth: 38 }}>
                        <span className={`text-[10px] font-bold mb-1 ${pctColor(b.pct)}`}>
                          {b.pct == null ? '' : `${Math.round(b.pct)}%`}
                        </span>
                        <div className="w-full flex flex-col justify-end" style={{ height: '75%' }}>
                          <div className={`w-full rounded-t ${pctBar(b.pct)} group-hover:ring-2 ring-white/30`}
                            style={{ height: `${Math.max(b.pct ?? 0, 2)}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 font-mono">{b.label}</span>
                        <span className="text-[9px] text-gray-600">{b.n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Case drill-down ── */}
            {tab === 'cases' && (
              <section className="bg-gray-800 rounded-2xl border border-gray-700 overflow-x-auto">
                <table className="w-full text-sm min-w-[1000px]">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
                      <th className="px-3 py-3 text-left w-8"></th>
                      <th className="px-3 py-3 text-left">Set</th>
                      <th className="px-3 py-3 text-left">HN</th>
                      <th className="px-3 py-3 text-left">Priority</th>
                      <th className="px-3 py-3 text-left">Diagnosis</th>
                      <th className="px-3 py-3 text-right">Set→Acc</th>
                      <th className="px-3 py-3 text-right">Acc→Arr</th>
                      <th className="px-3 py-3 text-right">Set→Arrival</th>
                      <th className="px-3 py-3 text-right">Arr→Inc</th>
                      <th className="px-3 py-3 text-right">เกินเป้า</th>
                      <th className="px-3 py-3 text-left">เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.map(({ c, t }) => (
                      <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/40">
                        <td className="px-3 py-2.5 text-center">
                          {t.status === 'On-time' ? <span className="text-green-400">✓</span>
                            : t.status === 'Delayed' ? <span className="text-red-400">✕</span>
                            : <span className="text-gray-600">–</span>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs font-mono whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}{' '}
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-blue-300 text-xs">{c.hn ?? '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${PRIORITY_BY_KEY[c.condition]?.color ?? 'bg-gray-600'}`}>
                            {priorityLabel(c.condition)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-white max-w-[240px] truncate">{c.dx ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sky-400 text-xs">{fmtMins(t.setToAccept)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-violet-400 text-xs">{fmtMins(t.acceptToArrival)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold text-xs ${
                          t.status === 'Delayed' ? 'text-red-400' : t.status === 'On-time' ? 'text-green-400' : 'text-gray-400'}`}>
                          {fmtMins(t.setToArrival)}{t.approximate && <span className="text-amber-500 ml-0.5">≈</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-teal-400 text-xs">{fmtMins(t.arrivalToIncision)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-orange-400 text-xs">
                          {t.delayMin ? `+${fmtMins(t.delayMin)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs max-w-[200px] truncate">
                          {c.delay_reason ?? (t.status === 'Delayed' ? <span className="text-yellow-600">ยังไม่กรอก</span> : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {withTimings.length > 200 && (
                  <p className="text-center text-gray-600 text-xs py-3">
                    แสดง 200 เคสแรก (เรียงตามเกินเป้ามากสุด) จากทั้งหมด {withTimings.length}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
