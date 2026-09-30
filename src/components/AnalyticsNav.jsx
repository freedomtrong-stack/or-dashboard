import { Link, useLocation } from 'react-router-dom'

// Shared nav for the back-office analysis pages. The live board and the ward
// forms deliberately stay out of this — they are a separate surface.
const PAGES = [
  { to: '/kpi',      label: 'KPI' },
  { to: '/report',   label: 'Timeliness' },
  { to: '/backfill', label: 'Backfill' },
  { to: '/dept',     label: 'Departments' },
  { to: '/idle',     label: 'Idle Gaps' },
]

export default function AnalyticsNav() {
  const { pathname } = useLocation()

  return (
    <nav className="flex items-center gap-1 flex-wrap">
      {PAGES.map((p) => {
        const active = pathname === p.to
        return (
          <Link
            key={p.to}
            to={p.to}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {p.label}
          </Link>
        )
      })}
      <Link
        to="/dashboard"
        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-white transition-colors"
        title="กลับหน้าบอร์ดหน้างาน"
      >
        ← Board
      </Link>
    </nav>
  )
}
