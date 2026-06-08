import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import UpdaterForm from './components/UpdaterForm'
import ReserveForm from './components/ReserveForm'
import KpiDashboard from './components/KpiDashboard'
import PinGate from './components/PinGate'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/update"
          element={<PinGate><UpdaterForm /></PinGate>}
        />
        <Route
          path="/update/:id"
          element={<PinGate><UpdaterForm /></PinGate>}
        />
        <Route
          path="/reserve"
          element={<PinGate><ReserveForm /></PinGate>}
        />
        <Route
          path="/kpi"
          element={<PinGate><KpiDashboard /></PinGate>}
        />
      </Routes>
    </BrowserRouter>
  )
}
