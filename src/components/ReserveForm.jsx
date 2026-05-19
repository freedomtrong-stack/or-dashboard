import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function ReserveForm() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ note: '', hn: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  function set(field) {
    return (value) => setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.from('or_cases').insert({
      condition: 'Immediate',
      note: form.note.trim() || null,
      hn: form.hn.trim() || null,
      status: 'Reserve',
      dx: null,
      operation: null,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 1000)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <Link
            to="/dashboard"
            className="text-gray-400 hover:text-white p-1.5 -ml-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-purple-400 rounded-full animate-pulse" />
              Reserve OR
            </h1>
            <p className="text-xs text-gray-400">Always Immediate — details added when patient arrives</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="px-4 py-6 max-w-lg mx-auto space-y-6">

        {/* Immediate badge — fixed, not selectable */}
        <div className="flex items-center justify-center py-4 rounded-xl bg-red-950/60 border-2 border-red-500">
          <span className="text-red-400 font-bold text-lg tracking-wide">🔴 IMMEDIATE</span>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Report
            <span className="ml-2 text-gray-500 text-xs font-normal">e.g. Vascular injury, จอมทอง</span>
          </label>
          <textarea
            value={form.note}
            onChange={(e) => set('note')(e.target.value)}
            placeholder="Describe the case / source / ETA"
            rows={3}
            className="w-full px-4 py-3.5 text-base font-bold border-2 border-purple-700 focus:border-purple-400 rounded-xl focus:outline-none bg-gray-800 text-white placeholder-gray-600 placeholder:font-normal transition-colors resize-none"
          />
        </div>

        {/* HN — optional */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            HN
            <span className="ml-2 text-gray-500 text-xs font-normal">Optional — leave blank if unknown</span>
          </label>
          <input
            type="text"
            value={form.hn}
            onChange={(e) => set('hn')(e.target.value)}
            placeholder="Unknown"
            className="w-full px-4 py-4 text-base border-2 border-gray-700 focus:border-blue-500 rounded-xl focus:outline-none bg-gray-800 text-white placeholder-gray-600 transition-colors"
          />
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-purple-900/50 border border-purple-600 text-purple-300 px-4 py-3 rounded-xl text-sm text-center font-semibold">
            Standby set! Returning…
          </div>
        )}

        <button
          type="submit"
          disabled={loading || success}
          className="w-full py-5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white text-lg font-bold rounded-xl transition-colors shadow-lg"
        >
          {loading ? 'Saving…' : '⚡ Set Standby'}
        </button>
      </form>
    </div>
  )
}
