import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const CONDITIONS = ['Immediate', 'Critical', 'Urgency', 'Expedited']
const STATUSES = ['Reserve', 'Waiting', 'Next', 'On case', 'เลื่อน NPO', 'Done']
const DEPARTMENTS = ['Surgery', 'Orthopedic', 'Eye', 'ENT', 'OBGYN', 'Med']
const SURGERY_SUBTYPES = ['UGI', 'Colo', 'HPB', 'BE', 'Vas', 'Ped', 'CVT', 'Neuro', 'Plastic', 'Trauma', 'Uro', 'Transplant']

const CANCEL_STATUS = 'Cancelled'

const CONDITION_SELECTED = {
  Immediate:    'border-red-500 bg-red-50 text-red-700',
  Critical:    'border-orange-500 bg-orange-50 text-orange-700',
  Urgency:      'border-yellow-400 bg-yellow-50 text-yellow-700',
  'Expedited':'border-blue-500 bg-blue-50 text-blue-700',
}

const STATUS_SELECTED = {
  Reserve:      'border-purple-500 bg-purple-50 text-purple-700',
  Waiting:      'border-gray-500 bg-gray-100 text-gray-800',
  Next:         'border-yellow-400 bg-yellow-50 text-yellow-700',
  'On case':    'border-blue-500 bg-blue-50 text-blue-700',
  'เลื่อน NPO': 'border-gray-400 bg-gray-100 text-gray-700',
  Done:         'border-green-500 bg-green-50 text-green-700',
}

const IDLE = 'border-gray-200 bg-white text-gray-400'

export default function UpdaterForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = Boolean(id)

  const [form, setForm] = useState({
    hn: '',
    dx: '',
    operation: '',
    note: '',
    condition: 'Immediate',
    status: 'Reserve',
    department: null,
    subtype: null,
  })
  const [fetching, setFetching] = useState(isEditing)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const isReserve = form.status === 'Reserve'

  useEffect(() => {
    if (!isEditing) return
    async function loadCase() {
      const { data, error } = await supabase
        .from('or_cases')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        setError('Case not found.')
      } else {
        setForm({
          hn: data.hn ?? '',
          dx: data.dx,
          operation: data.operation,
          note: data.note ?? '',
          condition: data.condition,
          status: data.status,
          department: data.department ?? null,
          subtype: data.subtype ?? null,
        })
      }
      setFetching(false)
    }
    loadCase()
  }, [id, isEditing])

  function set(field) {
    return (value) => setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      hn: form.hn.trim() || null,
      dx: form.dx.trim(),
      operation: form.operation.trim(),
      note: form.note.trim() || null,
      condition: form.condition,
      status: form.status,
      department: form.department,
      subtype: form.department === 'Surgery' ? form.subtype : null,
    }

    const { error } = isEditing
      ? await supabase.from('or_cases').update(payload).eq('id', id)
      : await supabase.from('or_cases').insert(payload)

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 1200)
    }
  }

  async function handleCancel() {
    if (!window.confirm('Mark this case as Cancelled?')) return
    setLoading(true)
    const { error } = await supabase
      .from('or_cases')
      .update({ status: CANCEL_STATUS })
      .eq('id', id)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  async function handleDelete() {
    if (!window.confirm('Permanently delete this case? This cannot be undone.')) return
    setLoading(true)
    const { error } = await supabase.from('or_cases').delete().eq('id', id)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  if (fetching) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading case…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sticky header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <Link
            to="/dashboard"
            className="text-gray-500 hover:text-gray-800 p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Back to dashboard"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              {isEditing ? 'Edit Case' : 'New Case'}
            </h1>
            <p className="text-xs text-gray-400">OR Critical Form</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="px-4 py-6 max-w-lg mx-auto space-y-6">

        {/* Condition */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Condition <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('condition')(c)}
                className={`py-4 px-3 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                  form.condition === c
                    ? `${CONDITION_SELECTED[c]} shadow-md scale-[1.01]`
                    : IDLE
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {form.status === 'เลื่อน NPO'
              ? <span className="text-amber-600">Note <span className="font-normal text-xs">(e.g. เลื่อน NPO to AMN)</span></span>
              : form.status === 'Reserve'
              ? <span>Report <span className="text-purple-600 font-normal text-xs">(e.g. Vascular injury, จอมทอง)</span></span>
              : 'Note'}
          </label>
          <textarea
            value={form.note}
            onChange={(e) => set('note')(e.target.value)}
            placeholder={
              form.status === 'เลื่อน NPO' ? 'e.g. เลื่อน NPO to AMN' :
              isReserve ? 'e.g. Severe head injury, จอมทอง — ETA 20 min' :
              'Optional note'
            }
            rows={2}
            className={`w-full px-4 py-3.5 text-base font-semibold border-2 rounded-xl focus:outline-none bg-white transition-colors resize-none ${
              form.status === 'เลื่อน NPO' ? 'border-gray-400 focus:border-gray-500' :
              isReserve ? 'border-purple-400 focus:border-purple-500' :
              'border-gray-300 focus:border-blue-500'
            }`}
          />
        </div>

        {/* HN */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            HN (Hospital Number)
            {isReserve
              ? <span className="ml-2 text-gray-400 text-xs font-normal">Optional for Reserve</span>
              : <span className="text-red-500"> *</span>
            }
          </label>
          <input
            type="text"
            value={form.hn}
            onChange={(e) => set('hn')(e.target.value)}
            required={!isReserve}
            placeholder={isReserve ? 'Unknown / leave blank' : 'e.g. 3979502'}
            className="w-full px-4 py-4 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 bg-white transition-colors"
          />
        </div>

        {/* Diagnosis */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Diagnosis <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.dx}
            onChange={(e) => set('dx')(e.target.value)}
            required
            placeholder="e.g. Severe Head Injury"
            className="w-full px-4 py-4 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 bg-white transition-colors"
          />
        </div>

        {/* Operation */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Operation <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.operation}
            onChange={(e) => set('operation')(e.target.value)}
            required
            placeholder="e.g. Craniotomy"
            className="w-full px-4 py-4 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 bg-white transition-colors"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Department
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DEPARTMENTS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  set('department')(form.department === d ? null : d)
                  set('subtype')(null)
                }}
                className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95 ${
                  form.department === d
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md scale-[1.01]'
                    : 'border-gray-200 bg-white text-gray-400'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Surgery subtypes */}
          {form.department === 'Surgery' && (
            <div className="mt-3">
              <p className="text-xs text-indigo-500 font-semibold mb-2">Surgery subtype</p>
              <div className="grid grid-cols-4 gap-2">
                {SURGERY_SUBTYPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('subtype')(form.subtype === s ? null : s)}
                    className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all active:scale-95 ${
                      form.subtype === s
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 shadow-md'
                        : 'border-gray-200 bg-white text-gray-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Status <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set('status')(s)}
                className={`py-4 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 ${
                  form.status === s
                    ? `${STATUS_SELECTED[s]} shadow-md scale-[1.01]`
                    : IDLE
                }`}
              >
                {s === 'Reserve' ? '⚡ Reserve' : s}
              </button>
            ))}
          </div>
          {form.status === 'เลื่อน NPO' && (
            <p className="text-gray-500 text-xs mt-2">
              Case remains active — change back to Waiting when NPO time is ready.
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="bg-green-50 border border-green-300 text-green-700 px-4 py-3 rounded-xl text-sm text-center font-semibold">
            Saved! Returning to dashboard…
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || success}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white text-base font-bold rounded-xl transition-colors shadow-lg"
        >
          {loading ? 'Saving…' : isEditing ? 'Update Case' : 'Add Case'}
        </button>

        {/* Cancel case */}
        {isEditing && !success && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="w-full py-4 border-2 border-orange-400 text-orange-500 text-base font-semibold rounded-xl hover:bg-orange-50 active:bg-orange-100 transition-colors disabled:opacity-50"
          >
            Cancel Case
          </button>
        )}

        {/* Delete */}
        {isEditing && !success && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="w-full py-4 border-2 border-red-300 text-red-400 text-sm font-semibold rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors disabled:opacity-50"
          >
            Delete Permanently
          </button>
        )}
      </form>
    </div>
  )
}
