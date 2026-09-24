import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom'
import {
  CalendarDays,
  CalendarClock,
  ContactRound,
  ChartNoAxesCombined,
  ChevronLeft,
  Home,
  Landmark,
  Menu,
  Radar,
  Scissors,
  Settings,
  ShieldX,
  Tags,
  WalletCards,
  Wrench,
  PackageSearch,
  X,
} from 'lucide-react'
import EmptyState from '../ui/EmptyState'
import Spinner from '../ui/Spinner'
import useAdminProfile from '../../hooks/useAdminProfile'
import { resolveAdminAccess } from '../../lib/auth/adminAccess'
import garagemSymbol from '../../assets/brand/garagem-symbol.png'

const navItems = [
  {
    group: 'Visão Geral',
    items: [
      { label: 'Painel', href: '/admin/dashboard', icon: Home },
      { label: 'Mapa da barbearia', href: '/admin/mapa', icon: Radar },
    ],
  },
  {
    group: 'Financeiro',
    items: [
      { label: 'Visão financeira', href: '/admin/financeiro', icon: ChartNoAxesCombined },
      { label: 'Contas', href: '/admin/financeiro/titulos', icon: Landmark },
      { label: 'Envelopes', href: '/admin/financeiro/envelopes', icon: WalletCards },
      { label: 'Cadastros', href: '/admin/financeiro/cadastros', icon: Tags },
    ],
  },
  {
    group: 'Operacional',
    items: [
      { label: 'Agenda', href: '/admin/agenda', icon: CalendarDays },
      { label: 'Clientes', href: '/admin/clientes', icon: ContactRound },
      { label: 'Barbeiros', href: '/admin/barbeiros', icon: Scissors },
      { label: 'Serviços e materiais', href: '/admin/catalogo', icon: Wrench },
      { label: 'Produtos e estoque', href: '/admin/produtos', icon: PackageSearch },
      { label: 'Disponibilidade', href: '/admin/disponibilidade', icon: CalendarClock },
    ],
  },
  {
    group: 'Sistema',
    items: [{ label: 'Configurações', href: '/admin/configuracoes', icon: Settings }],
  },
]

const mobileNavItems = [
  { label: 'Painel', href: '/admin/dashboard', icon: Home },
  { label: 'Agenda', href: '/admin/agenda', icon: CalendarDays },
  { label: 'Mapa', href: '/admin/mapa', icon: Radar },
  { label: 'Financeiro', href: '/admin/financeiro', icon: ChartNoAxesCombined },
  { label: 'Contas', href: '/admin/financeiro/titulos', icon: Landmark },
]

function Navigation({ isCollapsed = false, onNavigate }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto p-4" aria-label="Navegação administrativa">
      {navItems.map((group) => (
        <div key={group.group}>
          <h2 className={`mb-2 text-label text-steel ${isCollapsed ? 'text-center' : 'pl-2'}`}>
            {isCollapsed ? group.group.slice(0, 1) : group.group}
          </h2>
          <ul className="space-y-2">
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <NavLink
                    to={item.href}
                    end
                    onClick={onNavigate}
                    aria-label={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex min-h-12 items-center rounded-sm border px-3 text-body-sm font-semibold transition-colors duration-100 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 ${
                        isActive
                          ? 'border-copper bg-copper/8 text-copper'
                          : 'border-transparent text-steel hover:bg-surface-2 hover:text-warm-white'
                      } ${isCollapsed ? 'justify-center' : ''}`
                    }
                  >
                    <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
                    {!isCollapsed && <span className="ml-3">{item.label}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function DesktopSidebar({ isCollapsed }) {
  return (
    <aside
      className={`hidden shrink-0 flex-col border-r border-line bg-surface-1 transition-all duration-200 ease-brand lg:flex ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className={`flex h-16 shrink-0 items-center border-b border-line ${isCollapsed ? 'justify-center' : 'gap-3 px-6'}`}>
        <img src={garagemSymbol} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
        {!isCollapsed && <span className="text-h3 text-gold-aged">GARAGEM</span>}
      </div>
      <Navigation isCollapsed={isCollapsed} />
    </aside>
  )
}

function MobileDrawer({ open, onClose, userName }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Fechar menu"
        onClick={onClose}
        className="absolute inset-0 bg-surface-0/80 backdrop-blur-sm"
      />
      <aside className="relative flex h-full w-[min(86vw,22rem)] flex-col border-r border-line bg-surface-1 shadow-overlay">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={garagemSymbol} alt="" aria-hidden="true" className="h-8 w-8 shrink-0 object-contain" />
            <div className="min-w-0">
              <span className="block text-h3 text-gold-aged">GARAGEM</span>
              <span className="block truncate text-label text-steel">{userName}</span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <Navigation onNavigate={onClose} />
      </aside>
    </div>
  )
}

function MobileBottomNavigation({ onOpenMenu }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface-1/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Atalhos administrativos"
    >
      {mobileNavItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.href}
            to={item.href}
            end
            className={({ isActive }) =>
              `flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold transition-colors ${
                isActive ? 'text-copper' : 'text-steel'
              }`
            }
          >
            <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
            <span className="max-w-full truncate">{item.label}</span>
          </NavLink>
        )
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] font-semibold text-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-copper"
      >
        <Menu size={21} strokeWidth={1.8} aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  )
}

export default function AdminLayout() {
  const auth = useAdminProfile()
  const access = resolveAdminAccess(auth)
  const [isCollapsed, setCollapsed] = useState(false)
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false)

  if (access === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <span className="inline-flex items-center gap-3 text-body text-steel">
          <Spinner size={24} /> Verificando acesso
        </span>
      </div>
    )
  }
  if (access === 'signed_out') return <Navigate to="/login" replace />
  if (access === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
        <EmptyState
          icon={ShieldX}
          title="Acesso administrativo negado"
          description="Seu perfil não possui autorização administrativa ou não pôde ser validado."
          action={
            <Link
              to="/login"
              className="rounded-sm border border-copper px-5 py-3 text-body font-semibold text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper"
            >
              Voltar ao login
            </Link>
          }
        />
      </div>
    )
  }

  const userName = auth.profile.nome || 'Administrador'

  return (
    <div className="flex h-[100dvh] min-w-0 bg-surface-0 text-warm-white">
      <DesktopSidebar isCollapsed={isCollapsed} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-line bg-surface-1/90 px-4 backdrop-blur-sm lg:px-6">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-sm text-steel hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper lg:hidden"
          >
            <Menu size={22} aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={() => setCollapsed(!isCollapsed)}
            className="hidden rounded-sm p-2 text-steel transition-colors duration-100 ease-brand hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper lg:block"
          >
            {isCollapsed ? <Menu size={20} aria-hidden="true" /> : <ChevronLeft size={20} aria-hidden="true" />}
          </button>

          <div className="flex items-center gap-2 lg:hidden">
            <img src={garagemSymbol} alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
            <span className="text-body font-semibold text-gold-aged">GARAGEM</span>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-copper/40 bg-copper/10 text-body-sm font-bold text-copper lg:hidden">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="hidden text-body-sm text-steel lg:block">{userName}</span>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-5 sm:px-6 lg:p-6">
          <Outlet />
        </main>
      </div>

      <MobileBottomNavigation onOpenMenu={() => setMobileMenuOpen(true)} />
      <MobileDrawer open={isMobileMenuOpen} onClose={() => setMobileMenuOpen(false)} userName={userName} />
    </div>
  )
}
