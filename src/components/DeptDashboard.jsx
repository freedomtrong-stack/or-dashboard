import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import AnalyticsNav from './AnalyticsNav'

const SEVERE_HEAD_KEYWORDS = [
  'head injury', 'severe head', 'head inj', 'sdh', 'edh',
  'subdural', 'epidural hematoma', 'traumatic brain', 'tbi',
  'brain injury', 'intracerebral', 'บาดเจ็บศีรษะ',
]
const isSevereHead = (c) => {
  const dx = (c.dx ?? '').toLowerCase()
  return SEVERE_HEAD_KEYWORDS.some((k) => dx.includes(k))
}

const KPI_CATEGORIES = [
  { key: 'severe', label: 'Severe Head Injury', target: 30,  match: isSevereHead },
  { key: 'imm',    label: 'Immediate',          target: 30,  match: (c) => c.condition === 'Immediate' },
  { key: 'crit',   label: 'Critical',           target: 60,  match: (c) => c.condition === 'Critical' },
  { key: 'urg',    label: 'Urgency',            target: 360, match: (c) => c.condition === 'Urgency' },
]

const CONDITIONS = ['Immediate', 'Critical', 'Urgency', 'Expedited', 'Non-critical']
const CONDITION_COLOR = {
  Immediate: 'bg-red-600',
  Critical: 'bg-orange-500',
  Urgency: 'bg-yellow-400',
  Expedited: 'bg-blue-500',
  'Non-critical': 'bg-gray-500',
}

const UNSET = '(ไม่ระบุ)'
const UNGROUPED = 'Other / ungrouped'

// ── Operation grouping ───────────────────────────────────────────────────────
// Operation is free text (1000+ distinct spellings for ~1300 cases), so cases are
// bucketed by keyword. First matching rule wins, which means a combined procedure
// lands in whichever family is listed first — order below IS the taxonomy.
// word-boundary match so "db" doesn't hit "abd"
const w = (...alts) => new RegExp(`(^|[^a-z0-9])(${alts.join('|')})($|[^a-z0-9])`, 'i')

const OP_GROUPS = [
  ['Appendectomy',                w('appendectomy','appendecomy','appendicectomy')],
  ['Kidney transplant',           w('ddkt','cdkt','kt','kidney transplant')],
  ['Cholecystectomy',             w('lc','cholecystectomy','open chole')],
  ['Cesarean section',            w('c/s','cesarean','caesarean')],
  ['Tracheostomy',                w('tracheostomy','trachoestomy','tracheotomy','t-tube')],
  ['Craniotomy / neurosurgery',   w('craniotomy','craniectomy','cranioplasty','cranio','burr hole','elevate skull','evd','vp shunt','vps','shunt','lp','icp')],
  ['Exploratory laparotomy',      w('el','explor(?:e|atory)? ?lap(?:arotomy)?','laparotomy','re-el','2nd look')],
  ['Debridement / wound care',    w('db','i ?& ?d','i ?and ?d','debridement','incision and drainage','dressing','vac','fasciotomy','necrosectomy')],
  ['Fracture fixation',           w('orif','crif','crpp','tfna','pfna','wire fix','k-?wire','kwire','nail','plate fix','aoef','ex ?fix','external fixat','cr ?\\+')],
  ['Thoracic / cardiothoracic',   w('vats','thoracotomy','decortication','decorticate','sternotomy','icd','lobectomy','pericardi')],
  ['Endoscopy (GI)',              w('egd','colonoscop','esophagogastroduodenoscopy','gastroscop','ercp','sigmoidoscop')],
  ['Laryngoscopy / bronchoscopy', w('dl','bronchoscop','bronchosuction','broncho','esophagoscop','esophaguscope','otoscop','laryngoscop','micro-?laryn')],
  ['Eye procedures',              w('ppv','\\d+gppv','vitrectomy','lens aspiration','surgical pi','phaco','enucleation','evisceration','iol','tpk','mptscpc','keratoplasty','iridectomy','trabeculectomy','scleral','ahmed','ppl')],
  ['AV fistula / graft',          w('avf','avg','av fistula','av graft','cimino','hdn','perm ?cath','permcath')],
  ['Vascular repair / bypass',    w('embolectomy','thrombectomy','bypass','evar','endarterectomy','embolization','aaa','pseudoaneurysm','pseudoaneurys','crossover','repair vessel','aneurysm','arteri')],
  ['Amputation',                  w('amputation','amp','aka','bka','disarticulation')],
  ['Bowel / stoma surgery',       w('colostomy','ileostomy','hemicolectomy','bowel resection','anastomosis','anatomosis','hartmann','harmann','colectomy','ileocecectomy','gastrectomy','jejunostomy','fj','ar')],
  ['Urologic drainage',           w('pcn','nephrostomy','dj stent','double ?j','cystostomy','urs','turbt','turp','orchi','ureter')],
  ['Hernia repair',               w('herniorrhaphy','hernioplasty','hernia','inguinal')],
  ['Wound exploration / repair',  w('explore wound','wound exploration','repair wound','suture','tendon repair','primary repair','explore neck','explore')],
  ['Foreign body removal',        w('fb','foreign body')],
  ['Line / port insertion',       w('picc','port-?a-?cath','central line','cvp','chemoport')],
  ['Joint surgery',               w('arthrotomy','arthotomy','arthroscopy','arthroplasty','hemiarthroplasty','tka','tha','dair','spacer')],
  ['Skin graft / flap',           w('stsg','sstg','ssg','skin graft','flap','graft')],
  ['Anorectal',                   w('eua','fistulotomy','hemorrhoid','perianal','fistula-?in-?ano')],
  ['Gynecologic',                 w('tah','bso','salpingectomy','hysterectomy','ectopic','d&c')],
  ['Excision / biopsy',           w('excision','biopsy','remove','resection','mass')],
]

function opGroup(op) {
  const s = (op ?? '').toLowerCase()
  if (s.trim().length < 2) return null
  for (const [name, re] of OP_GROUPS) if (re.test(s)) return name
  return UNGROUPED
}


// ── Helpers ──────────────────────────────────────────────────────────────────
function waitMinutes(c) {
  if (!c.on_case_at || !c.created_at) return null
  return (new Date(c.on_case_at) - new Date(c.created_at)) / 60000
}

function orMinutes(c) {
  if (!c.on_case_at || !c.done_at) return null
  const m = (new Date(c.done_at) - new Date(c.on_case_at)) / 60000
  return m > 0 ? m : null
}

function fmtMins(m) {
  if (m == null) return '—'
  const mins = Math.round(m)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function targetFor(c) {
  for (const cat of KPI_CATEGORIES) {
    if (cat.match(c)) return cat
  }
  return null
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
    return d.getFullYear() === anchor.getFullYear()
      && Math.floor(d.getMonth() / 3) === Math.floor(anchor.getMonth() / 3)
  }
  return true
}

function periodLabel(granularity, anchor) {
  if (granularity === 'all') return 'All time'
  const y = anchor.getFullYear()
  if (granularity === 'year') return `${y}`
  if (granularity === 'month') return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
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

// One row of stats for a set of cases
function statsFor(cases) {
  const waits = cases.map(waitMinutes).filter((w) => w != null).sort((a, b) => a - b)
  const ors = cases.map(orMinutes).filter((m) => m != null).sort((a, b) => a - b)

  let met = 0, judged = 0
  for (const c of cases) {
    const w = waitMinutes(c)
    const cat = targetFor(c)
    if (w == null || cat == null) continue
    judged++
    if (w <= cat.target) met++
  }

  const mix = {}
  cases.forEach((c) => { mix[c.condition] = (mix[c.condition] ?? 0) + 1 })

  return {
    n: cases.length,
    median: quantile(waits, 0.5),
    p90: quantile(waits, 0.9),
    orMedian: quantile(ors, 0.5),
    orTotalHours: ors.reduce((s, m) => s + m, 0) / 60,
    pct: judged === 0 ? null : (met / judged) * 100,
    met,
    judged,
    mix,
  }
}

// ── Sub-components ───────────────────────────────────────────────────────────
function OperationTable({ rows, total, expanded, onToggle, onOpen }) {
  const shown = expanded ? rows : rows.slice(0, 10)
  const maxN = Math.max(1, ...rows.map((r) => r.stats.n))

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
              <th className="px-3 py-2.5 text-left w-8">#</th>
              <th className="px-3 py-2.5 text-left">Operation group</th>
              <th className="px-3 py-2.5 text-right">Cases</th>
              <th className="px-3 py-2.5 text-right">Share</th>
              <th className="px-3 py-2.5 text-right">Median wait</th>
              <th className="px-3 py-2.5 text-right">Median OR</th>
              <th className="px-3 py-2.5 text-right">OR hours</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.group} className="border-b border-gray-800 hover:bg-gray-800/40">
                <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => onOpen(r.group, r.cases)}
                    className={`text-left hover:underline underline-offset-2 font-semibold ${
                      r.group === UNGROUPED ? 'text-gray-500 italic font-normal' : 'text-white'
                    }`}
                  >
                    {r.group}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-gray-300 font-mono">{r.stats.n}</span>
                    <span className="hidden sm:block w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <span
                        className={`block h-1.5 rounded-full ${r.group === UNGROUPED ? 'bg-gray-600' : 'bg-teal-500'}`}
                        style={{ width: `${(r.stats.n / maxN) * 100}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-400 text-xs">
                  {((r.stats.n / total) * 100).toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-300 text-sm whitespace-nowrap">{fmtMins(r.stats.median)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-400 text-sm whitespace-nowrap">{fmtMins(r.stats.orMedian)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-400 text-sm whitespace-nowrap">
                  {r.stats.orTotalHours >= 1 ? `${Math.round(r.stats.orTotalHours)}h` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <button
          onClick={onToggle}
          className="mt-3 text-blue-400 hover:text-blue-300 text-xs font-semibold"
        >
          {expanded ? '▴ Show top 10 only' : `▾ Show all ${rows.length} groups`}
        </button>
      )}
    </>
  )
}

function ConditionMix({ mix, total }) {
  if (total === 0) return null
  return (
    <div className="flex h-2 w-24 rounded-full overflow-hidden bg-gray-700">
      {CONDITIONS.map((cond) => {
        const n = mix[cond] ?? 0
        if (n === 0) return null
        return (
          <div
            key={cond}
            className={CONDITION_COLOR[cond]}
            style={{ width: `${(n / total) * 100}%` }}
            title={`${cond}: ${n}`}
          />
        )
      })}
    </div>
  )
}

function CaseListModal({ title, cases, onClose }) {
  const rows = cases
    .map((c) => {
      const cat = targetFor(c)
      const wait = waitMinutes(c)
      return { ...c, cat, wait, met: cat && wait != null && wait <= cat.target }
    })
    .sort((a, b) => {
      const rank = (r) => (r.met ? 2 : r.cat ? 0 : 1)
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      return (b.wait ?? -1) - (a.wait ?? -1)
    })

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-gray-900 w-full sm:max-w-4xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h3 className="text-white font-bold">{title}</h3>
            <p className="text-gray-400 text-xs mt-0.5">{rows.length} cases · slowest first</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left w-8"></th>
                <th className="px-4 py-2.5 text-left">HN</th>
                <th className="px-4 py-2.5 text-left">Condition</th>
                <th className="px-4 py-2.5 text-left">Diagnosis</th>
                <th className="px-4 py-2.5 text-left">Operation</th>
                <th className="px-4 py-2.5 text-right">Wait</th>
                <th className="px-4 py-2.5 text-right">OR time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-2.5 text-center">
                    {c.cat == null || c.wait == null ? <span className="text-gray-600" title="No target for this condition">–</span>
                      : c.met ? <span className="text-green-400">✓</span>
                      : <span className="text-red-400">✕</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-blue-300 text-xs whitespace-nowrap">{c.hn ?? '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${CONDITION_COLOR[c.condition] ?? 'bg-gray-600'}`}>
                      {c.condition}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white">{c.dx ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{c.operation ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold text-xs whitespace-nowrap ${
                    c.cat == null || c.wait == null ? 'text-gray-400' : c.met ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {fmtMins(c.wait)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-400 text-xs whitespace-nowrap">
                    {fmtMins(orMinutes(c))}
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

function StatRow({ label, stats, depth = 0, expandable, expanded, onToggle, onOpen, maxN }) {
  return (
    <tr className={`border-b border-gray-800 hover:bg-gray-800/40 ${depth > 0 ? 'bg-gray-900/40' : ''}`}>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
          {expandable ? (
            <button onClick={onToggle} className="text-gray-500 hover:text-white w-4 shrink-0">
              {expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <button
            onClick={onOpen}
            className={`text-left hover:underline underline-offset-2 ${
              depth > 0 ? 'text-gray-300 text-sm' : 'text-white font-semibold'
            }`}
          >
            {label}
          </button>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="text-gray-300 font-mono text-sm">{stats.n}</span>
          <span className="hidden sm:block w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <span className="block h-1.5 bg-indigo-500 rounded-full" style={{ width: `${(stats.n / maxN) * 100}%` }} />
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-300 whitespace-nowrap">{fmtMins(stats.median)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-400 whitespace-nowrap">{fmtMins(stats.p90)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <span className={`font-bold text-sm font-mono ${compColor(stats.pct)}`}>
            {stats.pct == null ? '—' : `${Math.round(stats.pct)}%`}
          </span>
          <span className="hidden sm:block w-14 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <span className={`block h-1.5 rounded-full ${compBar(stats.pct)}`} style={{ width: `${stats.pct ?? 0}%` }} />
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-400 whitespace-nowrap">{fmtMins(stats.orMedian)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-400 whitespace-nowrap">
        {stats.orTotalHours >= 1 ? `${Math.round(stats.orTotalHours)}h` : '—'}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex justify-end">
          <ConditionMix mix={stats.mix} total={stats.n} />
        </div>
      </td>
    </tr>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
const SORTS = [
  { key: 'n',       label: 'Cases' },
  { key: 'median',  label: 'Median wait' },
  { key: 'p90',     label: 'P90 wait' },
  { key: 'pct',     label: 'Compliance' },
  { key: 'orTotal', label: 'OR hours' },
]

export default function DeptDashboard() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [granularity, setGranularity] = useState('all')
  const [anchor, setAnchor] = useState(new Date())
  const [expanded, setExpanded] = useState({})
  const [modal, setModal] = useState(null)
  const [sortBy, setSortBy] = useState('n')
  const [allOps, setAllOps] = useState(false)
  const [opDept, setOpDept] = useState(null)

  useEffect(() => {
    async function fetchAll() {
      let all = []
      let from = 0
      const page = 1000
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

  const periodCases = useMemo(
    () => cases.filter((c) => inPeriod(c.created_at, granularity, anchor)),
    [cases, granularity, anchor],
  )

  const groups = useMemo(() => {
    const byDept = {}
    periodCases.forEach((c) => {
      const d = c.department ?? UNSET
      ;(byDept[d] ??= []).push(c)
    })

    const rows = Object.entries(byDept).map(([dept, deptCases]) => {
      const bySub = {}
      deptCases.forEach((c) => {
        const s = c.subtype ?? UNSET
        ;(bySub[s] ??= []).push(c)
      })
      // only worth splitting when the department actually uses subtypes
      const hasSubtypes = Object.keys(bySub).some((k) => k !== UNSET)
      return {
        dept,
        cases: deptCases,
        stats: statsFor(deptCases),
        subs: hasSubtypes
          ? Object.entries(bySub)
              .map(([sub, subCases]) => ({ sub, cases: subCases, stats: statsFor(subCases) }))
              .sort((a, b) => b.stats.n - a.stats.n)
          : [],
      }
    })

    const val = (s) => sortBy === 'orTotal' ? s.orTotalHours : (s[sortBy] ?? -1)
    return rows.sort((a, b) => val(b.stats) - val(a.stats))
  }, [periodCases, sortBy])

  const opScope = useMemo(
    () => opDept ? periodCases.filter((c) => (c.department ?? UNSET) === opDept) : periodCases,
    [periodCases, opDept],
  )

  const opRows = useMemo(() => {
    const byGroup = {}
    opScope.forEach((c) => {
      const g = opGroup(c.operation)
      if (g == null) return
      ;(byGroup[g] ??= []).push(c)
    })
    return Object.entries(byGroup)
      .map(([group, cs]) => ({ group, cases: cs, stats: statsFor(cs) }))
      .sort((a, b) => b.stats.n - a.stats.n)
  }, [opScope])

  const opTotal = opRows.reduce((s, r) => s + r.stats.n, 0)

  const maxN = Math.max(1, ...groups.map((g) => g.stats.n))
  const unsetDept = periodCases.filter((c) => !c.department).length
  const unsetSub = periodCases.filter((c) => c.department === 'Surgery' && !c.subtype).length
  const overall = statsFor(periodCases)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div>
              <h1 className="text-xl font-bold tracking-wide">CMU OR · Department Statistics</h1>
              <p className="text-gray-400 text-xs mt-0.5">
                Volume, waiting time and OR utilisation by department and unit · Done cases only
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AnalyticsNav />
              <div className="text-right">
                <p className="text-gray-500 text-xs">Showing</p>
                <p className="text-white font-semibold text-sm">
                  {periodLabel(granularity, anchor)} · {periodCases.length} cases
                </p>
              </div>
            </div>
          </div>

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
                >‹</button>
                <span className="text-sm font-semibold min-w-[120px] text-center">
                  {periodLabel(granularity, anchor)}
                </span>
                <button
                  onClick={() => setAnchor((a) => shiftAnchor(granularity, a, 1))}
                  className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300"
                >›</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
        ) : periodCases.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">No cases in this period</div>
        ) : (
          <>
            {(unsetDept > 0 || unsetSub > 0) && (
              <div className="bg-amber-950/40 border border-amber-800/60 text-amber-200 px-4 py-3 rounded-xl mb-6 text-sm">
                ⚠️ Data gaps —{' '}
                {unsetDept > 0 && (
                  <>{unsetDept} case{unsetDept !== 1 ? 's' : ''} ({Math.round((unsetDept / periodCases.length) * 100)}%) without a department</>
                )}
                {unsetDept > 0 && unsetSub > 0 && ' · '}
                {unsetSub > 0 && <>{unsetSub} Surgery case{unsetSub !== 1 ? 's' : ''} without a unit</>}
                . These appear as “{UNSET}” below and make per-unit numbers incomplete.
              </div>
            )}

            {/* Overall summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Cases</p>
                <p className="text-3xl font-bold text-white mt-1">{overall.n}</p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Median wait</p>
                <p className="text-3xl font-bold text-white mt-1">{fmtMins(overall.median)}</p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Compliance</p>
                <p className={`text-3xl font-bold mt-1 ${compColor(overall.pct)}`}>
                  {overall.pct == null ? '—' : `${Math.round(overall.pct)}%`}
                </p>
              </div>
              <div className="bg-gray-800 rounded-2xl px-5 py-4 border border-gray-700">
                <p className="text-gray-500 text-xs">Total OR time</p>
                <p className="text-3xl font-bold text-indigo-400 mt-1">
                  {Math.round(overall.orTotalHours)}
                  <span className="text-base font-semibold text-gray-500 ml-1">h</span>
                </p>
              </div>
            </div>

            {/* Sort control */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Sort by</span>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    sortBy === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <section className="bg-gray-800 rounded-2xl border border-gray-700 overflow-x-auto mb-4">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
                    <th className="px-3 py-3 text-left">Department / Unit</th>
                    <th className="px-3 py-3 text-right">Cases</th>
                    <th className="px-3 py-3 text-right">Median wait</th>
                    <th className="px-3 py-3 text-right">P90 wait</th>
                    <th className="px-3 py-3 text-right">Compliance</th>
                    <th className="px-3 py-3 text-right">Median OR</th>
                    <th className="px-3 py-3 text-right">OR hours</th>
                    <th className="px-3 py-3 text-right">Condition mix</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <FragmentRows
                      key={g.dept}
                      group={g}
                      maxN={maxN}
                      expanded={!!expanded[g.dept]}
                      onToggle={() => setExpanded((e) => ({ ...e, [g.dept]: !e[g.dept] }))}
                      onOpen={(title, cs) => setModal({ title, cases: cs })}
                    />
                  ))}
                </tbody>
              </table>
            </section>

            <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500 mb-8">
              {CONDITIONS.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span className={`w-4 h-2 rounded-sm inline-block ${CONDITION_COLOR[c]}`} />{c}
                </span>
              ))}
              <span className="ml-auto">P90 = 10% of cases waited longer · click a name for its cases</span>
            </div>

            {/* Top operations */}
            <section className="bg-gray-800 rounded-2xl p-5 border border-gray-700 mb-8">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                <div>
                  <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">
                    Most frequent operations
                  </h2>
                  <p className="text-gray-500 text-xs mt-1">
                    Operation is free text, so cases are grouped by keyword — a combined procedure
                    counts once, under the first family it matches
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setOpDept(null)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      opDept === null ? 'bg-teal-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
                    }`}
                  >
                    All depts
                  </button>
                  {groups.map((g) => (
                    <button
                      key={g.dept}
                      onClick={() => setOpDept(g.dept)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        opDept === g.dept ? 'bg-teal-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
                      }`}
                    >
                      {g.dept}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                {opTotal === 0 ? (
                  <p className="text-gray-600 text-sm">No operations recorded</p>
                ) : (
                  <OperationTable
                    rows={opRows}
                    total={opTotal}
                    expanded={allOps}
                    onToggle={() => setAllOps((v) => !v)}
                    onOpen={(group, cs) => setModal({ title: opDept ? `${group} · ${opDept}` : group, cases: cs })}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {modal && (
        <CaseListModal title={modal.title} cases={modal.cases} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

function FragmentRows({ group, maxN, expanded, onToggle, onOpen }) {
  return (
    <>
      <StatRow
        label={group.dept}
        stats={group.stats}
        maxN={maxN}
        expandable={group.subs.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onOpen={() => onOpen(group.dept, group.cases)}
      />
      {expanded && group.subs.map((s) => (
        <StatRow
          key={s.sub}
          label={s.sub}
          stats={s.stats}
          depth={1}
          maxN={maxN}
          onOpen={() => onOpen(`${group.dept} · ${s.sub}`, s.cases)}
        />
      ))}
    </>
  )
}
