import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AnalyticsNav from './AnalyticsNav'
import {
  DELAY_REASONS, PROCESS_OWNERS, ownerFor, timings, isDelayed, needsReason,
  priorityLabel, PRIORITY_BY_KEY, fmtMins, RANGES, inRange, daysSince,
  RECALL_STALE_DAYS, UNKNOWN_REASON, toLocalInput, fromLocalInput,
} from '../lib/orKpi'

// Back-office only. This page never touches the live board — it fills in the
// timestamps and delay reasons that the ward form does not collect.

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-gray-600 mt-1">{hint}</span>}
    </label>
  )
}

function CaseEditor({ c, onSaved }) {
  const t = timings(c)
  const [form, setForm] = useState({
    accepted_at: toLocalInput(c.accepted_at),
    arrival_at: toLocalInput(c.arrival_at ?? c.on_case_at),
    incision_at: toLocalInput(c.incision_at),
    delay_reason: c.delay_reason ?? '',
    delay_detail: c.delay_detail ?? '',
    delay_process_owner: c.delay_process_owner ?? '',
    shi_fast_track: !!c.shi_fast_track,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  // Picking a reason fills the owning team, but a manual override sticks.
  function pickReason(reason) {
    setForm((f) => ({
      ...f,
      delay_reason: reason,
      delay_process_owner: ownerFor(reason) ?? f.delay_process_owner,
    }))
  }

  async function save() {
    setSaving(true)
    setErr(null)
    const payload = {
      accepted_at: fromLocalInput(form.accepted_at),
      arrival_at: fromLocalInput(form.arrival_at),
      incision_at: fromLocalInput(form.incision_at),
      delay_reason: form.delay_reason || null,
      delay_detail: form.delay_detail.trim() || null,
      delay_process_owner: form.delay_process_owner || null,
      shi_fast_track: form.shi_fast_track,
    }
    const { error } = await supabase.from('or_cases').update(payload).eq('id', c.id)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false)
    onSaved(c.id, payload)
  }

  const inputCls = 'w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500'

  return (
    <div className="bg-gray-850 border-t border-gray-700 px-4 py-4 bg-gray-900/60">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Field label="Accept — ห้องตอบรับเคส" hint="เวลาที่ห้องผ่าตัดรับทราบและตอบรับ">
          <input type="datetime-local" value={form.accepted_at}
            onChange={(e) => set('accepted_at')(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Arrival OR — ผู้ป่วยถึงห้อง" hint={c.arrival_at ? null : 'ค่าตั้งต้นมาจาก on_case_at เดิม (ไม่แน่นอน) — ยืนยันให้ถูก'}>
          <input type="datetime-local" value={form.arrival_at}
            onChange={(e) => set('arrival_at')(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Incision — ลงมีด" hint="ใช้วิเคราะห์กระบวนการในห้อง แยกจาก KPI">
          <input type="datetime-local" value={form.incision_at}
            onChange={(e) => set('incision_at')(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Field label="เหตุผลความล่าช้า">
          <select value={form.delay_reason} onChange={(e) => pickReason(e.target.value)} className={inputCls}>
            <option value="">— เลือก —</option>
            {DELAY_REASONS.map((d) => <option key={d.reason} value={d.reason}>{d.reason}</option>)}
          </select>
        </Field>
        <Field label="ทีม / กระบวนการที่เกี่ยวข้อง" hint="ใช้วิเคราะห์เชิงระบบ ไม่ใช่ระบุความผิดรายบุคคล">
          <select value={form.delay_process_owner} onChange={(e) => set('delay_process_owner')(e.target.value)} className={inputCls}>
            <option value="">— เลือก —</option>
            {PROCESS_OWNERS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="รายละเอียดเพิ่มเติม" hint="เช่น รอลิฟท์, รอ ICU bed">
          <input type="text" value={form.delay_detail} placeholder="ระบุเฉพาะเคสนี้"
            onChange={(e) => set('delay_detail')(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox" checked={form.shi_fast_track}
            onChange={(e) => set('shi_fast_track')(e.target.checked)}
            className="w-4 h-4 rounded accent-rose-500" />
          SHI Fast Track (เป้า 30 นาที)
        </label>
        <div className="flex items-center gap-3">
          {err && <span className="text-red-400 text-xs">{err}</span>}
          <button onClick={save} disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BackfillForm() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [range, setRange] = useState('last7')
  const [params, setParams] = useSearchParams()
  // Arriving from a KPI drill-down: show just that case, already open.
  const focusId = params.get('case')
  const [openId, setOpenId] = useState(null)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [saved, setSaved] = useState({})

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
          .order('created_at', { ascending: false })
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

  useEffect(() => {
    if (focusId) setOpenId(focusId)
  }, [focusId])

  // merge in-place so a saved row updates without refetching everything
  const merged = useMemo(
    () => cases.map((c) => (saved[c.id] ? { ...c, ...saved[c.id] } : c)),
    [cases, saved],
  )

  const rows = useMemo(() => {
    if (focusId) return merged.filter((c) => c.id === focusId)
    return merged
      .filter((c) => inRange(c.created_at, range))
      .filter(isDelayed)
      .filter((c) => !onlyMissing || needsReason(c))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [merged, range, onlyMissing, focusId])

  const periodDelayed = merged.filter((c) => inRange(c.created_at, range)).filter(isDelayed)
  const documented = periodDelayed.filter((c) => c.delay_reason).length
  const stale = periodDelayed.filter((c) => !c.delay_reason && daysSince(c.created_at) > RECALL_STALE_DAYS).length

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-wide">CMU OR · Backfill เคสล่าช้า</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                กรอกเวลา Accept / Arrival / Incision และเหตุผลความล่าช้าย้อนหลัง ·
                ไม่กระทบบอร์ดหน้างาน
              </p>
            </div>
            <div className="flex items-center gap-2">
              <AnalyticsNav />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    range === r.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}>{r.label}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer ml-2">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500" />
              แสดงเฉพาะที่ยังไม่กรอกเหตุผล
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">เคสล่าช้าในช่วงนี้</p>
                <p className="text-3xl font-bold text-red-400 mt-1">{periodDelayed.length}</p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">กรอกเหตุผลแล้ว</p>
                <p className="text-3xl font-bold text-green-400 mt-1">{documented}</p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">ยังไม่ได้กรอก</p>
                <p className="text-3xl font-bold text-yellow-400 mt-1">{periodDelayed.length - documented}</p>
                {stale > 0 && (
                  <p className="text-orange-400 text-xs mt-1">
                    {stale} เคสค้างเกิน {RECALL_STALE_DAYS} วัน
                  </p>
                )}
              </div>
            </div>

            {focusId && (
              <div className="bg-blue-950/40 border border-blue-800/60 text-blue-200 px-4 py-3 rounded-xl mb-4 text-sm flex items-center justify-between gap-4 flex-wrap">
                <span>กำลังดูเคสเดียวที่เลือกมาจากหน้า KPI</span>
                <button
                  onClick={() => { setParams({}); setOpenId(null) }}
                  className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                >
                  ดูเคสทั้งหมด
                </button>
              </div>
            )}

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                <p className="text-lg font-medium">ไม่มีเคสที่ต้องกรอก</p>
                <p className="text-sm mt-1">
                  {onlyMissing ? 'เคสล่าช้าในช่วงนี้กรอกเหตุผลครบแล้ว' : 'ไม่มีเคสล่าช้าในช่วงนี้'}
                </p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                {rows.map((c) => {
                  const t = timings(c)
                  const open = openId === c.id
                  return (
                    <div key={c.id} className="border-b border-gray-700 last:border-b-0">
                      <button
                        onClick={() => setOpenId(open ? null : c.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700/40 transition-colors text-left"
                      >
                        <span className="text-gray-500 w-4 shrink-0">{open ? '▾' : '▸'}</span>
                        <span className="text-gray-400 text-xs font-mono w-24 shrink-0">
                          {new Date(c.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                          {' '}
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </span>
                        <span className="font-mono text-blue-300 text-xs w-20 shrink-0">{c.hn ?? '—'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white shrink-0 ${PRIORITY_BY_KEY[c.condition]?.color ?? 'bg-gray-600'}`}>
                          {priorityLabel(c.condition)}
                        </span>
                        <span className="flex-1 min-w-0 text-white text-sm truncate">{c.dx ?? '—'}</span>
                        <span className="text-red-400 font-mono text-xs font-bold shrink-0">
                          +{fmtMins(t.delayMin)}
                        </span>
                        {t.approximate && (
                          <span className="text-amber-500 text-[10px] shrink-0" title="เวลา arrival มาจาก on_case_at เดิม ยังไม่ยืนยัน">≈</span>
                        )}
                        {c.delay_reason
                          ? <span className="text-green-400 text-xs shrink-0">✓</span>
                          : daysSince(c.created_at) > RECALL_STALE_DAYS
                          ? <span className="text-orange-400 text-[11px] font-semibold shrink-0 whitespace-nowrap"
                              title="ผ่านมานานแล้ว ความจำอาจไม่แม่น — ถ้าไม่แน่ใจให้เลือก ไม่ทราบสาเหตุ">
                              ค้าง {daysSince(c.created_at)} วัน
                            </span>
                          : <span className="text-yellow-500 text-xs shrink-0">ต้องกรอก</span>}
                      </button>
                      {open && (
                        <CaseEditor
                          c={c}
                          onSaved={(id, payload) => {
                            setSaved((s) => ({ ...s, [id]: payload }))
                            // jump straight to the next case so a batch can be
                            // worked through without re-clicking each row
                            const i = rows.findIndex((r) => r.id === id)
                            setOpenId(rows[i + 1]?.id ?? null)
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-center text-gray-600 text-xs mt-5">
              ≈ = เวลา Arrival ยังใช้ค่าเดิมจาก on_case_at ซึ่งคนกรอกตีความต่างกัน · เปิดเคสเพื่อยืนยัน
              <br />จำไม่ได้ว่าทำไมช้า ให้เลือก “{UNKNOWN_REASON}” — อย่าเดา เพราะในรายงานจะดูเหมือนข้อมูลจริง
            </p>
          </>
        )}
      </main>
    </div>
  )
}
