import { Outlet, Link, NavLink, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { Home, ChartNoAxesCombined, Landmark, Tags, Scissors, Settings, ChevronLeft, Menu, ShieldX, WalletCards, Radar } from 'lucide-react'
import EmptyState from '../ui/EmptyState'
import Spinner from '../ui/Spinner'
import useAdminProfile from '../../hooks/useAdminProfile'
import { resolveAdminAccess } from '../../lib/auth/adminAccess'
import garagemSymbol from '../../assets/brand/garagem-symbol.png'

const navItems = [
  { group: 'Visão Geral', items: [{ label: 'Dashboard', href: '/admin/dashboard', icon: Home }, { label: 'Mapa da barbearia', href: '/admin/mapa', icon: Radar }] },
  { group: 'Financeiro', items: [{ label: 'Visão financeira', href: '/admin/financeiro', icon: ChartNoAxesCombined }, { label: 'Contas', href: '/admin/financeiro/titulos', icon: Landmark }, { label: 'Envelopes', href: '/admin/financeiro/envelopes', icon: WalletCards }, { label: 'Cadastros', href: '/admin/financeiro/cadastros', icon: Tags }] },
  { group: 'Operacional', items: [{ label: 'Barbeiros', href: '/admin/barbeiros', icon: Scissors }] },
  { group: 'Sistema', items: [{ label: 'Configurações', href: '/admin/configuracoes', icon: Settings }] },
]

function Sidebar({ isCollapsed }) {
  return <aside className={`border-r border-line bg-surface-1 transition-all duration-200 ease-brand ${isCollapsed ? 'w-20' : 'w-64'}`}><div className={`flex h-16 items-center border-b border-line ${isCollapsed ? 'justify-center' : 'gap-3 px-6'}`}><img src={garagemSymbol} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />{!isCollapsed && <span className="text-h3 text-gold-aged">GARAGEM</span>}</div><nav className="flex-1 space-y-6 p-4" aria-label="Navegação administrativa">{navItems.map((group) => <div key={group.group}><h2 className={`mb-2 text-label text-steel ${isCollapsed ? 'text-center' : 'pl-2'}`}>{isCollapsed ? group.group.slice(0, 1) : group.group}</h2><ul className="space-y-2">{group.items.map((item) => { const Icon = item.icon; return <li key={item.href}><NavLink to={item.href} end aria-label={isCollapsed ? item.label : undefined} className={({ isActive }) => `flex min-h-10 items-center rounded-sm border px-3 text-body-sm font-semibold transition-colors duration-100 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 ${isActive ? 'border-copper bg-copper/8 text-copper' : 'border-transparent text-steel hover:bg-surface-2 hover:text-warm-white'} ${isCollapsed ? 'justify-center' : ''}`}><Icon size={20} strokeWidth={1.75} aria-hidden="true" />{!isCollapsed && <span className="ml-3">{item.label}</span>}</NavLink></li>})}</ul></div>)}</nav></aside>
}

export default function AdminLayout() {
  const auth = useAdminProfile()
  const access = resolveAdminAccess(auth)
  const [isCollapsed, setCollapsed] = useState(false)

  if (access === 'loading') return <div className="flex min-h-screen items-center justify-center bg-surface-0"><span className="inline-flex items-center gap-3 text-body text-steel"><Spinner size={24} /> Verificando acesso</span></div>
  if (access === 'signed_out') return <Navigate to="/login" replace />
  if (access === 'denied') return <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6"><EmptyState icon={ShieldX} title="Acesso administrativo negado" description="Seu perfil não possui autorização administrativa ou não pôde ser validado." action={<Link to="/login" className="rounded-sm border border-copper px-5 py-3 text-body font-semibold text-copper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">Voltar ao login</Link>} /></div>

  return <div className="flex h-screen bg-surface-0 text-warm-white"><Sidebar isCollapsed={isCollapsed} /><div className="flex min-w-0 flex-1 flex-col overflow-hidden"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-surface-1/80 px-6 backdrop-blur-sm"><button aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'} onClick={() => setCollapsed(!isCollapsed)} className="rounded-sm p-2 text-steel transition-colors duration-100 ease-brand hover:bg-surface-2 hover:text-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper">{isCollapsed ? <Menu size={20} strokeWidth={1.75} aria-hidden="true" /> : <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />}</button><span className="text-body-sm text-steel">{auth.profile.nome || 'Usuário administrador'}</span></header><main className="flex-1 overflow-y-auto p-6"><Outlet /></main></div></div>
}
