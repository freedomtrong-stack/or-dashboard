import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const CONDITION_ROW = {
  Immediate:    'bg-red-950/60 hover:bg-red-950/80',
  Critical:    'bg-orange-950/60 hover:bg-orange-950/80',
  Urgency:      'bg-yellow-950/50 hover:bg-yellow-950/70',
  'Expedited':'bg-blue-950/40 hover:bg-blue-950/60',
}

const CONDITION_BADGE = {
  Immediate:    'bg-red-600 text-white',
  Critical:    'bg-orange-500 text-white',
  Urgency:      'bg-yellow-400 text-gray-900',
  'Expedited':'bg-blue-500 text-white',
}

const STATUS_BADGE = {
  Reserve:      'bg-purple-600 text-white',
  Waiting:      'bg-gray-600 text-gray-100',
  Next:         'bg-yellow-400 text-gray-900',
  'On case':    'bg-green-500 text-white',
  'เลื่อน NPO': 'bg-gray-500 text-white',
  Done:         'bg-gray-500 text-white',
  Cancelled:    'bg-red-900 text-red-300',
}

const CONDITION_ORDER = { Immediate: 0, Critical: 1, Urgency: 2, 'Expedited': 3 }
const STATUS_ORDER = { 'On case': 0, Next: 1, Waiting: 2 }

const NEXT_STATUSES = {
  Reserve:      ['Waiting', 'Cancelled'],
  Waiting:      ['Next', 'On case', 'เลื่อน NPO', 'Cancelled'],
  Next:         ['On case', 'Waiting', 'Cancelled'],
  'On case':    ['Done', 'Cancelled'],
  'เลื่อน NPO': ['Waiting', 'Cancelled'],
  Done:         ['On case', 'Waiting'],
  Cancelled:    ['Waiting'],
}

const DROPDOWN_BTN = {
  Waiting:      'hover:bg-gray-700 text-gray-200',
  Next:         'hover:bg-yellow-900 text-yellow-300',
  'On case':    'hover:bg-green-900 text-green-300',
  'เลื่อน NPO': 'hover:bg-gray-700 text-gray-300',
  Done:         'hover:bg-blue-900 text-blue-300',
  Cancelled:    'hover:bg-red-900 text-red-400',
}

const CORRECT_PIN = import.meta.env.VITE_UPDATER_PIN ?? '1234'
const SESSION_KEY = 'or_pin_unlocked'

function PinModal({ onSuccess, onClose }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  function handleDigit(d) {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError(false)
    if (next.length === 4) {
      if (next === CORRECT_PIN) {
        sessionStorage.setItem(SESSION_KEY, 'true')
        onSuccess()
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 600)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl p-6 w-72 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-sm">Enter PIN to continue</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs">✕</button>
        </div>
        <div className={`flex justify-center gap-3 mb-5 ${shake ? 'animate-bounce' : ''}`}>
          {[0,1,2,3].map((i) => (
            <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
              pin.length > i
                ? error ? 'bg-red-500 border-red-500' : 'bg-blue-400 border-blue-400'
                : 'bg-transparent border-gray-600'
            }`} />
          ))}
        </div>
        {error && <p className="text-red-400 text-xs text-center mb-3">Incorrect PIN</p>}
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6,7,8,9].map((d) => (
            <button key={d} onClick={() => handleDigit(String(d))}
              className="h-12 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white font-semibold rounded-xl transition-colors">
              {d}
            </button>
          ))}
          <button onClick={() => setPin(p => p.slice(0,-1))}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl transition-colors flex items-center justify-center">
            ⌫
          </button>
          <button onClick={() => handleDigit('0')}
            className="h-12 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white font-semibold rounded-xl transition-colors">
            0
          </button>
          <button onClick={() => setPin('')}
            className="h-12 bg-gray-800 hover:bg-gray-700 text-gray-500 text-xs rounded-xl transition-colors">
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusDropdown({ caseId, currentStatus, onUpdate }) {
  const [open, setOpen] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const nexts = NEXT_STATUSES[currentStatus] ?? []

  function handleBadgeClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      setOpen((o) => !o)
    } else {
      setShowPin(true)
    }
  }

  if (nexts.length === 0) {
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[currentStatus] ?? 'bg-gray-600 text-white'}`}>
        {currentStatus}
      </span>
    )
  }

  return (
    <>
      {showPin && (
        <PinModal
          onSuccess={() => { setShowPin(false); setOpen(true) }}
          onClose={() => setShowPin(false)}
        />
      )}
      <div className="relative inline-block">
        <button
          onClick={handleBadgeClick}
          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[currentStatus] ?? 'bg-gray-600 text-white'} flex items-center gap-1`}
        >
          {currentStatus}
          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[140px]">
              {nexts.map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onUpdate(caseId, s)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition-colors ${DROPDOWN_BTN[s] ?? 'hover:bg-gray-700 text-white'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function maskHN(hn) {
  if (!hn) return '—'
  if (sessionStorage.getItem(SESSION_KEY) === 'true') return hn
  if (hn.length <= 2) return '**'
  return hn.slice(0, -2) + '**'
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function duration(from, to) {
  if (!from) return '—'
  const ms = new Date(to ?? Date.now()) - new Date(from)
  const mins = Math.floor(ms / 60000)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h ${mins % 60}m`
  return `${mins}m`
}

export default function Dashboard() {
  const [active, setActive] = useState([])
  const [history, setHistory] = useState([])
  const [tab, setTab] = useState('active')
  const [filter, setFilter] = useState(null)
  const [historyFilter, setHistoryFilter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    fetchActive()
    fetchHistory()

    const channel = supabase
      .channel('or_cases_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'or_cases' },
        () => {
          fetchActive()
          fetchHistory()
          setLastUpdated(new Date())
        },
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchActive() {
    const { data, error } = await supabase
      .from('or_cases')
      .select('*')
      .not('status', 'in', '("Done","Cancelled")')
      .order('created_at', { ascending: true })

    if (error) setError('Failed to load cases.')
    else {
      setActive(data)
      setError(null)
      // find most recent update across all active cases
      if (data.length > 0) {
        const latest = data.reduce((max, c) => {
          const t = new Date(c.updated_at ?? c.created_at)
          return t > max ? t : max
        }, new Date(0))
        setLastUpdated(latest)
      }
    }
    setLoading(false)
  }

  async function fetchHistory() {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('or_cases')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    if (data) setHistory(data)
  }

  async function quickStatus(id, status) {
    await supabase.from('or_cases').update({ status }).eq('id', id)
  }

  const reserve = active.filter((c) => c.status === 'Reserve')
  const postponed = active.filter((c) => c.status === 'เลื่อน NPO')
  const sorted = active
    .filter((c) => c.status !== 'Reserve' && c.status !== 'เลื่อน NPO')
    .filter((c) => !filter || c.condition === filter)
    .sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      if (statusDiff !== 0) return statusDiff
      return (CONDITION_ORDER[a.condition] ?? 9) - (CONDITION_ORDER[b.condition] ?? 9)
    })

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        {/* Clock — desktop only */}
        <div className="hidden md:block text-center mb-2">
          <p className="text-4xl font-bold font-mono tracking-widest text-white">
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
          <p className="text-gray-400 text-xs mt-0.5">
            {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-1">
            <h1 className="text-lg font-bold tracking-wide">CMU OR Status</h1>
            <span className="flex items-center gap-1.5 text-green-400 text-sm font-medium">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              ON
            </span>
            {lastUpdated && (
              <div className="ml-auto text-right">
                <p className="text-gray-500 text-xs">Last updated</p>
                <p className="text-white text-sm font-semibold">
                  {lastUpdated.toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  {' '}
                  {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href="tel:053935777"
              className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 active:bg-green-800 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call Stretcher
            </a>
            <Link
              to="/reserve"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              ⚡ Reserve
            </Link>
            <Link
              to="/update"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              + Add Case
            </Link>
          </div>
        </div>
      </header>

      {/* Tabs + Filter */}
      <div className="bg-gray-800 border-b border-gray-700 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3 py-2">
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab('active')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'active' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Active
              <span className="ml-2 bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">
                {active.length}
              </span>
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              History 48h
              <span className="ml-2 bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">
                {history.length}
              </span>
            </button>
          </div>

          {/* Filter buttons */}
          {tab === 'active' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilter(null)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  !filter ? 'bg-gray-500 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                All
              </button>
              {Object.entries(CONDITION_BADGE).map(([label, cls]) => (
                <button
                  key={label}
                  onClick={() => setFilter(filter === label ? null : label)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    filter === label
                      ? `${cls} ring-2 ring-white/40 scale-105`
                      : `${cls} opacity-50 hover:opacity-100`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm">
            {error}
          </div>
        )}

        {/* STANDBY BANNER — always visible when reserve cases exist */}
        {tab === 'active' && reserve.length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" />
              <h2 className="text-purple-300 text-sm font-bold uppercase tracking-widest">
                Standby / Reserve ({reserve.length})
              </h2>
            </div>
            {reserve.map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-4 px-4 py-3.5 rounded-xl border-2 border-purple-500/60 bg-purple-950/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${CONDITION_BADGE[c.condition] ?? 'bg-gray-600 text-white'}`}>
                      {c.condition}
                    </span>
                    {maskHN(c.hn) !== '—' && <span className="text-blue-400 font-mono text-xs">{maskHN(c.hn)}</span>}
                    <StatusDropdown caseId={c.id} currentStatus={c.status} onUpdate={quickStatus} />
                  </div>
                  <p className="text-white font-semibold">{c.dx ?? <span className="text-gray-500 italic">TBD</span>}</p>
                  <p className="text-gray-400 text-sm">{c.operation ?? '—'}</p>
                  {c.note && <p className="text-purple-300 text-sm mt-1 italic">"{c.note}"</p>}
                </div>
                <Link to={`/update/${c.id}`} className="text-purple-400 hover:text-purple-300 text-xs whitespace-nowrap mt-1 underline underline-offset-2">
                  Edit
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* ACTIVE TAB */}
        {tab === 'active' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center h-64 text-gray-400">Loading cases…</div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <svg className="w-14 h-14 mb-4 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-medium">No active cases</p>
                <p className="text-sm mt-1">All clear — no pending or on-going cases</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {sorted.map((c, i) => (
                    <div
                      key={c.id}
                      className={`rounded-xl border-l-4 px-4 py-3.5 ${
                        c.condition === 'Immediate'    ? 'border-red-500 bg-red-950/60' :
                        c.condition === 'Critical'    ? 'border-orange-500 bg-orange-950/60' :
                        c.condition === 'Urgency'      ? 'border-yellow-400 bg-yellow-950/50' :
                        'border-blue-500 bg-blue-950/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs font-mono">{i + 1}</span>
                          <Link to={`/update/${c.id}`} className="text-blue-400 font-mono font-semibold text-sm underline underline-offset-2">
                            {maskHN(c.hn)}
                          </Link>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${CONDITION_BADGE[c.condition] ?? 'bg-gray-600 text-white'}`}>
                            {c.condition}
                          </span>
                          <StatusDropdown caseId={c.id} currentStatus={c.status} onUpdate={quickStatus} />
                        </div>
                      </div>
                      <p className="text-white font-semibold text-base leading-tight">{c.dx ?? <span className="text-gray-500 italic">Diagnosis TBD</span>}</p>
                      <p className="text-gray-400 text-sm mt-0.5">{c.operation ?? <span className="italic">—</span>}</p>
                      {c.note && <p className="text-purple-300 text-xs mt-1 italic">"{c.note}"</p>}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-xl shadow-xl">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-700 text-gray-300 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left w-10">#</th>
                        <th className="px-4 py-3 text-left">HN</th>
                        <th className="px-4 py-3 text-left">Diagnosis</th>
                        <th className="px-4 py-3 text-left">Operation</th>
                        <th className="px-4 py-3 text-left">Condition</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((c, i) => (
                        <tr
                          key={c.id}
                          className={`border-b border-gray-700/50 transition-colors ${
                            CONDITION_ROW[c.condition] ?? 'bg-gray-800'
                          }`}
                        >
                          <td className="px-4 py-3.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                          <td className="px-4 py-3.5">
                            <Link to={`/update/${c.id}`} className="font-mono text-blue-400 hover:text-blue-300 underline underline-offset-2 text-sm">
                              {maskHN(c.hn)}
                            </Link>
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-white">{c.dx ?? <span className="text-gray-500 italic">TBD</span>}</td>
                          <td className="px-4 py-3.5 text-gray-300">{c.operation ?? <span className="text-gray-600 italic">—</span>}</td>
                          <td className="px-4 py-3.5">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${CONDITION_BADGE[c.condition] ?? 'bg-gray-600 text-white'}`}>
                              {c.condition}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusDropdown caseId={c.id} currentStatus={c.status} onUpdate={quickStatus} />
                          </td>
                          <td className="px-4 py-3.5 text-gray-400 text-sm">{c.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p className="text-center text-gray-600 text-xs mt-5">
              {sorted.length} active case{sorted.length !== 1 ? 's' : ''} · Done & Cancelled cases are hidden
            </p>

            {/* เลื่อน NPO section */}
            {postponed.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 bg-gray-400 rounded-full" />
                  <h2 className="text-gray-400 text-sm font-bold uppercase tracking-widest">
                    เลื่อน NPO ({postponed.length})
                  </h2>
                </div>
                <div className="space-y-2 md:hidden">
                  {postponed.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-4 px-4 py-3.5 rounded-xl border-l-4 border-gray-500 bg-gray-800/50 opacity-80"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${CONDITION_BADGE[c.condition] ?? 'bg-gray-600 text-white'}`}>
                            {c.condition}
                          </span>
                          {maskHN(c.hn) !== '—' && <span className="text-blue-400 font-mono text-xs">{maskHN(c.hn)}</span>}
                          <StatusDropdown caseId={c.id} currentStatus={c.status} onUpdate={quickStatus} />
                        </div>
                        <p className="text-gray-300 font-semibold">{c.dx ?? <span className="italic text-gray-500">TBD</span>}</p>
                        <p className="text-gray-500 text-sm">{c.operation ?? '—'}</p>
                        {c.note && <p className="text-gray-400 text-sm font-semibold mt-1">📋 {c.note}</p>}
                      </div>
                      <Link to={`/update/${c.id}`} className="text-gray-500 hover:text-gray-300 text-xs whitespace-nowrap mt-1 underline underline-offset-2">
                        Edit
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto rounded-xl">
                  <table className="w-full text-sm opacity-80">
                    <tbody>
                      {postponed.map((c, i) => (
                        <tr key={c.id} className="border-b border-amber-900/40 bg-amber-950/30 hover:bg-amber-950/50 transition-colors">
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{i + 1}</td>
                          <td className="px-4 py-3">
                            <Link to={`/update/${c.id}`} className="font-mono text-blue-400 hover:text-blue-300 underline underline-offset-2 text-sm">
                              {maskHN(c.hn)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-300 font-semibold">{c.dx ?? <span className="italic text-gray-500">TBD</span>}</td>
                          <td className="px-4 py-3 text-gray-400">{c.operation ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${CONDITION_BADGE[c.condition] ?? 'bg-gray-600 text-white'}`}>
                              {c.condition}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="bg-gray-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">เลื่อน NPO</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <>
            {/* History filter */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              {['All', 'Done', 'Cancelled', 'On case', 'Waiting'].map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f === 'All' ? null : f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    (f === 'All' && !historyFilter) || historyFilter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {f}
                  <span className="ml-1.5 text-xs opacity-70">
                    {f === 'All'
                      ? history.length
                      : history.filter(c => c.status === f).length}
                  </span>
                </button>
              ))}
            </div>

            {history.filter(c => !historyFilter || c.status === historyFilter).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <p className="text-lg font-medium">No cases found</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl shadow-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-700 text-gray-300 text-xs uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">HN</th>
                      <th className="px-4 py-3 text-left">Diagnosis</th>
                      <th className="px-4 py-3 text-left">Operation</th>
                      <th className="px-4 py-3 text-left">Condition</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Created</th>
                      <th className="px-4 py-3 text-left">On Case</th>
                      <th className="px-4 py-3 text-left">Done</th>
                      <th className="px-4 py-3 text-left">Total Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.filter(c => !historyFilter || c.status === historyFilter).map((c) => (
                      <tr
                        key={c.id}
                        className={`border-b border-gray-700/50 transition-colors ${
                          c.status === 'Done' || c.status === 'Cancelled'
                            ? 'bg-gray-800/60 opacity-60'
                            : CONDITION_ROW[c.condition] ?? 'bg-gray-800'
                        }`}
                      >
                        <td className="px-4 py-3.5 font-mono text-blue-300 text-xs">{maskHN(c.hn)}</td>
                        <td className="px-4 py-3.5 font-semibold text-white">{c.dx}</td>
                        <td className="px-4 py-3.5 text-gray-300">{c.operation}</td>
                        <td className="px-4 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${CONDITION_BADGE[c.condition] ?? 'bg-gray-600 text-white'}`}>
                            {c.condition}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusDropdown caseId={c.id} currentStatus={c.status} onUpdate={quickStatus} />
                        </td>
                        <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(c.created_at)}</td>
                        <td className="px-4 py-3.5 text-green-400 text-xs whitespace-nowrap">{fmtDate(c.on_case_at)}</td>
                        <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(c.done_at)}</td>
                        <td className="px-4 py-3.5 text-yellow-400 text-xs font-mono">
                          {c.done_at
                            ? duration(c.created_at, c.done_at)
                            : duration(c.created_at, null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-center text-gray-600 text-xs mt-5">
              {history.length} case{history.length !== 1 ? 's' : ''} in the last 48 hours
            </p>
          </>
        )}
      </main>
    </div>
  )
}
