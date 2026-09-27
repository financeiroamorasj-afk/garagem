import { useState } from 'react'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import garagemLogo from '../assets/brand/garagem-logo-full.png'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const redirectTo = new URL('/definir-senha', window.location.origin).toString()
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
      if (recoveryError) throw recoveryError
      setSent(true)
    } catch {
      setError('Não foi possível enviar o e-mail agora. Aguarde um momento e tente novamente.')
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

        {sent ? (
          <div className="space-y-5 text-center">
            <MailCheck size={40} className="mx-auto text-success" aria-hidden="true" />
            <div>
              <span className="mb-2 block text-label text-copper">RECUPERAÇÃO DE ACESSO</span>
              <h1 className="text-h1 text-warm-white">Confira seu e-mail</h1>
              <p className="mt-3 text-body-sm text-steel">Se este endereço estiver cadastrado, você receberá um link para criar uma nova senha. Verifique também a caixa de spam.</p>
            </div>
            <Link to="/login" className="inline-flex min-h-11 items-center gap-2 text-body font-semibold text-copper">
              <ArrowLeft size={17} aria-hidden="true" /> Voltar ao login
            </Link>
          </div>
        ) : (
          <>
            <div>
              <span className="mb-2 block text-label text-copper">RECUPERAÇÃO DE ACESSO</span>
              <h1 className="text-h1 text-warm-white">Esqueceu sua senha?</h1>
              <p className="mt-2 text-body-sm text-steel">Informe o e-mail usado no Garagem. Enviaremos um link seguro para você criar uma nova senha.</p>
            </div>
            <form className="space-y-5" onSubmit={submit}>
              {error && <div role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger">{error}</div>}
              <Input label="E-mail de acesso" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" disabled={submitting} />
              <Button type="submit" size="lg" loading={submitting} className="w-full">Enviar link de recuperação</Button>
            </form>
            <Link to="/login" className="inline-flex min-h-11 items-center gap-2 text-body-sm font-semibold text-copper">
              <ArrowLeft size={17} aria-hidden="true" /> Voltar ao login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
