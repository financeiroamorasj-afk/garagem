import { useEffect, useState } from 'react'
import { CheckCircle, KeyRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import garagemLogo from '../assets/brand/garagem-logo-full.png'
import { supabase } from '../lib/supabase'
import { homeRouteForRole } from '../lib/auth/homeRoute'

export default function SetPassword() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setChecking(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setChecking(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Use uma senha com pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmation) {
      setError('As senhas não coincidem.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle()
      navigate(homeRouteForRole(profile?.role), { replace: true })
    } catch {
      setError('Não foi possível definir a senha. Solicite um novo convite ao administrador.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-surface-0 p-4 font-sans sm:p-6">
      <div className="atmosphere-vignette absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-md space-y-6 rounded-md border border-line bg-surface-1 p-5 sm:p-8">
        <div className="flex justify-center">
          <img src={garagemLogo} alt="Garagem System" className="w-52 max-w-full object-contain sm:w-64" />
        </div>

        <div>
          <span className="mb-2 flex items-center gap-2 text-label text-copper"><KeyRound size={16} /> PRIMEIRO ACESSO</span>
          <h1 className="text-h1 text-warm-white">Crie sua senha</h1>
          <p className="mt-2 text-body-sm text-steel">Esta senha será pessoal. O administrador da barbearia não terá acesso a ela.</p>
        </div>

        {checking ? (
          <p className="text-body text-steel">Validando convite...</p>
        ) : !session ? (
          <div className="space-y-4">
            <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">
              Este convite expirou ou já foi utilizado.
            </div>
            <Link to="/login" className="inline-flex min-h-11 items-center text-body font-semibold text-copper">Voltar ao login</Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            {error && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error}</div>}
            <Input label="Nova senha" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} helpText="Use pelo menos 8 caracteres." required disabled={submitting} />
            <Input label="Confirmar senha" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={submitting} />
            <Button type="submit" size="lg" loading={submitting} className="w-full gap-2">
              <CheckCircle size={18} /> Salvar e entrar
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
