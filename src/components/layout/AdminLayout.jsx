import { Outlet, Link, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { Home, DollarSign, Scissors, Settings, ChevronLeft, Menu } from 'lucide-react'; // Placeholder icons

// Mock user, replace with actual auth context
const useUser = () => ({ user: { role: 'admin' }, loading: false });

const navItems = [
    {
        group: 'Visão Geral',
        items: [
            { label: 'Dashboard', href: '/admin/dashboard', icon: <Home size={20} /> },
        ]
    },
    {
        group: 'Financeiro',
        items: [
            { label: 'Conciliação', href: '/admin/financeiro/conciliacao', icon: <DollarSign size={20} /> },
            { label: 'DRE', href: '/admin/financeiro/dre', icon: <DollarSign size={20} /> },
        ]
    },
    {
        group: 'Operacional',
        items: [
            { label: 'Barbeiros', href: '/admin/barbeiros', icon: <Scissors size={20} /> },
        ]
    },
    {
        group: 'Sistema',
        items: [
            { label: 'Configurações', href: '/admin/configuracoes', icon: <Settings size={20} /> },
        ]
    }
];

const Sidebar = ({ isCollapsed }) => (
    <aside className={`bg-surface-1 border-r border-line transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <div className="flex items-center justify-center h-16 border-b border-line">
            <span className={`text-gold-aged font-bold text-2xl ${isCollapsed ? 'hidden' : 'block'}`}>GARAGEM</span>
            <span className={`text-gold-aged font-bold text-2xl ${isCollapsed ? 'block' : 'hidden'}`}>G</span>
        </div>
        <nav className="flex-1 p-4 space-y-6">
            {navItems.map(navGroup => (
                <div key={navGroup.group}>
                    <h3 className={`text-label text-steel-dark mb-2 ${isCollapsed ? 'text-center' : 'pl-2'}`}>
                        {isCollapsed ? navGroup.group.substring(0, 1) : navGroup.group}
                    </h3>
                    <ul className="space-y-2">
                        {navGroup.items.map(item => (
                            <li key={item.label}>
                                <NavLink
                                    to={item.href}
                                    end
                                    className={({ isActive }) =>
                                        `flex items-center p-2 rounded-lg transition-colors ${
                                            isActive
                                                ? 'bg-surface-brand-selected text-gold-aged'
                                                : 'text-steel hover:bg-surface-3'
                                        } ${isCollapsed ? 'justify-center' : ''}`
                                    }
                                >
                                    {item.icon}
                                    {!isCollapsed && <span className="ml-3">{item.label}</span>}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </nav>
    </aside>
);

const Header = ({ isCollapsed, setCollapsed }) => (
    <header className="bg-surface-2/80 backdrop-blur-sm border-b border-line sticky top-0 z-20 flex items-center justify-between h-16 px-6">
        <button onClick={() => setCollapsed(!isCollapsed)} className="text-steel hover:text-white">
            {isCollapsed ? <Menu size={24} /> : <ChevronLeft size={24} />}
        </button>
        <div className="flex items-center space-x-4">
            <span className="text-steel">Usuário Admin</span>
            {/* User menu can go here */}
        </div>
    </header>
);

export default function AdminLayout() {
    const { user, loading } = useUser();
    const [isCollapsed, setCollapsed] = useState(false);

    if (loading) {
        return <div>Carregando...</div>; // Or a spinner
    }

    // ACL Check
    if (!user || !['admin', 'master'].includes(user.role)) {
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center bg-surface-1 text-white">
                <h1 className="text-4xl font-bold">Acesso Negado</h1>
                <p className="mt-2 text-steel">Você não tem permissão para acessar esta página.</p>
                <Link to="/login" className="mt-6 text-gold-aged hover:underline">
                    Voltar para o Login
                </Link>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-surface-main text-text-primary">
            <Sidebar isCollapsed={isCollapsed} />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header isCollapsed={isCollapsed} setCollapsed={setCollapsed} />
                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
