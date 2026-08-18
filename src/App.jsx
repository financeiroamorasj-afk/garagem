import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import AdminLayout from './components/layout/AdminLayout';

// Common Pages
import Login from './pages/Login';
import DesignSystem from './pages/DesignSystem';
import ProtectedRoute from './components/ProtectedRoute';

// Dashboards & Pages
import AdminDashboard from './pages/AdminDashboard';
import Dashboard from './pages/Dashboard';
import BarberDashboard from './pages/BarberDashboard';
import ReceptionBoard from './pages/ReceptionBoard';

// Placeholder component for routes under construction
const Placeholder = ({ title }) => (
    <div className="text-center p-8">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-steel">Página em construção.</p>
    </div>
);

function App() {
    return (
        <BrowserRouter>
            <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/design-system" element={<DesignSystem />} />

                {/* Legacy Protected Routes (Kept for now) */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/barber/dashboard" element={<BarberDashboard />} />
                    <Route path="/reception/board" element={<ReceptionBoard />} />
                </Route>

                {/* New Admin Routes */}
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute>
                            <AdminLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route
                        path="financeiro/conciliacao"
                        element={<Placeholder title="Conciliação Financeira" />}
                    />
                    <Route 
                        path="financeiro/dre" 
                        element={<Placeholder title="Demonstrativo de Resultados" />} 
                    />
                    {/* Add other admin routes here as needed */}
                </Route>

                {/* Fallback for any other route */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
