import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import EmptyState from './ui/EmptyState'
import Spinner from './ui/Spinner'
import { mensagemErroModulo, verificarAcessoModulo } from '../lib/configuracoes/modulos-api'

export default function ModuleGate({ modulo, allowedRoles, accessRpc, children }) {
  const [state, setState] = useState({ loading: true, allowed: false, error: '' })

  useEffect(() => {
    let active = true
    async function checkAccess() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser()
        if (userError || !userData.user) throw userError || new Error('Sessão inválida')
        const [moduleAllowed, profileResult, operationalResult] = await Promise.all([
          verificarAcessoModulo(modulo),
          supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle(),
          accessRpc ? supabase.rpc(accessRpc) : Promise.resolve({ data: true, error: null }),
        ])
        if (profileResult.error) throw profileResult.error
        if (operationalResult.error) throw operationalResult.error
        const roleAllowed = (!allowedRoles?.length || allowedRoles.includes(profileResult.data?.role)) && Boolean(operationalResult.data)
        if (active) setState({ loading: false, allowed: moduleAllowed && roleAllowed, error: roleAllowed ? '' : 'Este usuário não tem acesso à recepção.' })
      } catch (error) {
        if (active) setState({ loading: false, allowed: false, error: mensagemErroModulo(error) })
      }
    }
    checkAccess()
    return () => { active = false }
  }, [accessRpc, allowedRoles, modulo])

  if (state.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-0 text-steel"><span className="inline-flex items-center gap-3"><Spinner size={24} /> Verificando módulo</span></div>
  }

  if (!state.allowed) {
    return <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6 text-warm-white"><EmptyState icon={ShieldX} title="Módulo não disponível" description={state.error || 'A Recepção precisa estar contratada e ativada pelo proprietário da barbearia.'} action={<Link to="/admin/configuracoes" className="inline-flex min-h-11 items-center rounded-sm border border-copper px-5 text-sm font-semibold uppercase tracking-button text-copper">Ver configurações</Link>} /></div>
  }

  return children
}
