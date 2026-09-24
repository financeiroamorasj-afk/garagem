import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import EmptyState from './ui/EmptyState'
import Spinner from './ui/Spinner'
import { mensagemErroModulo, verificarAcessoModulo } from '../lib/configuracoes/modulos-api'

export default function ModuleGate({ modulo, children }) {
  const [state, setState] = useState({ loading: true, allowed: false, error: '' })

  useEffect(() => {
    let active = true
    verificarAcessoModulo(modulo)
      .then((allowed) => active && setState({ loading: false, allowed, error: '' }))
      .catch((error) => active && setState({ loading: false, allowed: false, error: mensagemErroModulo(error) }))
    return () => { active = false }
  }, [modulo])

  if (state.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-0 text-steel"><span className="inline-flex items-center gap-3"><Spinner size={24} /> Verificando módulo</span></div>
  }

  if (!state.allowed) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6 text-warm-white"><EmptyState icon={ShieldX} title="Módulo não disponível" description={state.error || 'A Recepção precisa estar contratada e ativada pelo proprietário da barbearia.'} action={<Link to="/admin/configuracoes" className="inline-flex min-h-11 items-center rounded-sm border border-copper px-5 text-sm font-semibold uppercase tracking-button text-copper">Ver configurações</Link>} /></div>
  }

  return children
}
