import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout'
import Login from './pages/Login'
import DesignSystem from './pages/DesignSystem'
import ProtectedRoute from './components/ProtectedRoute'
import ModuleGate from './components/ModuleGate'
import AdminDashboard from './pages/AdminDashboard'
import Dashboard from './pages/Dashboard'
import BarberDashboard from './pages/BarberDashboard'
import ReceptionBoard from './pages/ReceptionBoard'
import FinanceOverview from './pages/financeiro/FinanceOverview'
import FinanceTitles from './pages/financeiro/FinanceTitles'
import FinanceRegistrations from './pages/financeiro/FinanceRegistrations'
import FinanceEnvelopes from './pages/financeiro/FinanceEnvelopes'
import MapaBarbearia from './pages/MapaBarbearia'
import AdminBarbers from './pages/AdminBarbers'
import AdminAgenda from './pages/AdminAgenda'
import AdminCatalog from './pages/AdminCatalog'
import AdminAvailability from './pages/AdminAvailability'
import AdminClients from './pages/AdminClients'
import SetPassword from './pages/SetPassword'
import ClientPortal from './pages/ClientPortal'
import AdminProducts from './pages/AdminProducts'
import AdminSettings from './pages/AdminSettings'
import AdminReceptionReport from './pages/AdminReceptionReport'

const RECEPTION_ROLES = ['recepcao']
const ADMIN_ROLES = ['admin', 'master']

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/definir-senha" element={<SetPassword />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="/portal/:slug" element={<ClientPortal />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/barber/dashboard" element={<BarberDashboard />} />
          <Route path="/reception/board" element={<ModuleGate modulo="recepcao" allowedRoles={RECEPTION_ROLES}><ReceptionBoard /></ModuleGate>} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="mapa" element={<MapaBarbearia />} />
            <Route path="financeiro" element={<FinanceOverview />} />
            <Route path="financeiro/titulos" element={<FinanceTitles />} />
            <Route path="financeiro/cadastros" element={<FinanceRegistrations />} />
            <Route path="financeiro/envelopes" element={<FinanceEnvelopes />} />
            <Route path="barbeiros" element={<AdminBarbers />} />
            <Route path="agenda" element={<AdminAgenda />} />
            <Route path="catalogo" element={<AdminCatalog />} />
            <Route path="produtos" element={<AdminProducts />} />
            <Route path="disponibilidade" element={<AdminAvailability />} />
            <Route path="clientes" element={<AdminClients />} />
            <Route path="recepcao" element={<ModuleGate modulo="recepcao" allowedRoles={ADMIN_ROLES}><AdminReceptionReport /></ModuleGate>} />
            <Route path="configuracoes" element={<AdminSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
