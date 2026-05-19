import { useState } from 'react'

const CORRECT_PIN = import.meta.env.VITE_UPDATER_PIN ?? '1234'
const SESSION_KEY = 'or_pin_unlocked'

export default function PinGate({ children }) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true',
  )
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
        setUnlocked(true)
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => {
          setPin('')
          setShake(false)
        }, 600)
      }
    }
  }

  function handleClear() {
    setPin('')
    setError(false)
  }

  if (unlocked) return children

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-6">
      {/* Icon */}
      <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>

      <h1 className="text-white text-xl font-bold mb-1">OR Updater</h1>
      <p className="text-gray-400 text-sm mb-8">Enter PIN to continue</p>

      {/* PIN dots */}
      <div className={`flex gap-4 mb-8 ${shake ? 'animate-bounce' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              pin.length > i
                ? error
                  ? 'bg-red-500 border-red-500'
                  : 'bg-blue-400 border-blue-400'
                : 'bg-transparent border-gray-600'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4 -mt-4">Incorrect PIN</p>
      )}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            onClick={() => handleDigit(String(d))}
            className="h-16 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-xl font-semibold rounded-2xl transition-colors"
          >
            {d}
          </button>
        ))}
        {/* Bottom row: clear, 0, backspace */}
        <button
          onClick={handleClear}
          className="h-16 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-400 text-sm font-semibold rounded-2xl transition-colors"
        >
          Clear
        </button>
        <button
          onClick={() => handleDigit('0')}
          className="h-16 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-xl font-semibold rounded-2xl transition-colors"
        >
          0
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="h-16 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-400 rounded-2xl transition-colors flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
