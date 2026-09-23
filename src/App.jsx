import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout'
import Login from './pages/Login'
import DesignSystem from './pages/DesignSystem'
import ProtectedRoute from './components/ProtectedRoute'
import AdminDashboard from './pages/AdminDashboard'
import Dashboard from './pages/Dashboard'
import BarberDashboard from './pages/BarberDashboard'
import ReceptionBoard from './pages/ReceptionBoard'
import FinanceOverview from './pages/financeiro/FinanceOverview'
import FinanceTitles from './pages/financeiro/FinanceTitles'
import FinanceRegistrations from './pages/financeiro/FinanceRegistrations'
import FinanceEnvelopes from './pages/financeiro/FinanceEnvelopes'
import AdminPlaceholder from './pages/AdminPlaceholder'
import MapaBarbearia from './pages/MapaBarbearia'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/design-system" element={<DesignSystem />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/barber/dashboard" element={<BarberDashboard />} />
          <Route path="/reception/board" element={<ReceptionBoard />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="mapa" element={<MapaBarbearia />} />
            <Route path="financeiro" element={<FinanceOverview />} />
            <Route path="financeiro/titulos" element={<FinanceTitles />} />
            <Route path="financeiro/cadastros" element={<FinanceRegistrations />} />
            <Route path="financeiro/envelopes" element={<FinanceEnvelopes />} />
            <Route path="barbeiros" element={<AdminPlaceholder title="Barbeiros" description="A gestão de barbeiros será integrada com segurança em uma próxima etapa." />} />
            <Route path="configuracoes" element={<AdminPlaceholder title="Configurações" description="As configurações administrativas serão disponibilizadas em uma próxima etapa segura." />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
