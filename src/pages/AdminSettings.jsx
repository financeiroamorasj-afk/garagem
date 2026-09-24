import { useCallback, useEffect, useState } from 'react'
import { Building2, CheckCircle2, Headset, LockKeyhole, RefreshCw } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import ReceptionUsersPanel from '../components/settings/ReceptionUsersPanel'
import { definirModuloAtivo, listarModulos, mensagemErroModulo } from '../lib/configuracoes/modulos-api'

function statusBadge(modulo) {
  if (modulo.ativo) return { variant: 'success', label: 'Ativo na unidade' }
  if (modulo.contratado) return { variant: 'warning', label: modulo.status_contrato === 'trial' ? 'Teste contratado' : 'Contratado' }
  if (modulo.status_contrato === 'suspenso') return { variant: 'danger', label: 'Suspenso' }
  if (modulo.status_contrato === 'cancelado') return { variant: 'neutral', label: 'Cancelado' }
  return { variant: 'neutral', label: 'Não contratado' }
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(value)) : null
}

export default function AdminSettings() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setModules(await listarModulos()) }
    catch (loadError) { setError(mensagemErroModulo(loadError)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(modulo) {
    setSaving(modulo.chave)
    setError('')
    setNotice('')
    try {
      await definirModuloAtivo({ modulo: modulo.chave, ativo: !modulo.ativo, expectedUpdatedAt: modulo.updated_at })
      setNotice(`${modulo.nome} ${modulo.ativo ? 'desativada' : 'ativada'} nesta unidade.`)
      await load()
    } catch (saveError) {
      setError(mensagemErroModulo(saveError))
    } finally {
      setSaving('')
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
      <header>
        <span className="mb-2 block text-label text-copper">SISTEMA</span>
        <h1 className="text-h1 text-warm-white sm:text-display">Configurações</h1>
        <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Controle os recursos contratados e o que fica disponível na operação desta barbearia.</p>
      </header>

      {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success">{notice}</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger"><span>{error}</span><Button size="sm" variant="danger" onClick={load}><RefreshCw size={15} /> Tentar novamente</Button></div>}

      <section aria-labelledby="modules-title">
        <div className="mb-4 flex items-center gap-3"><Headset size={20} className="text-copper" /><div><h2 id="modules-title" className="text-h2 text-warm-white">Módulos da assinatura</h2><p className="text-body-sm text-steel">Adicionais comerciais liberados pelo Garagem System.</p></div></div>

        {loading ? (
          <Card className="flex min-h-48 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Carregando módulos</Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {modules.map((modulo) => {
              const badge = statusBadge(modulo)
              const endDate = formatDate(modulo.status_contrato === 'trial' ? modulo.trial_ate : modulo.vigente_ate)
              return <Card key={modulo.chave} className="flex flex-col gap-5 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-copper/30 bg-copper/8 text-copper"><Building2 size={21} /></span><div><h3 className="text-h2 text-warm-white">{modulo.nome}</h3><p className="mt-1 text-body-sm text-steel">{modulo.descricao}</p></div></div><Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge></div>

                <div className="rounded-sm border border-line bg-surface-0 p-4">
                  {modulo.contratado ? <p className="flex items-start gap-2 text-body-sm text-steel"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-success" /><span>O módulo está coberto pela assinatura{endDate ? ` até ${endDate}` : ''}. O proprietário decide quando ativá-lo na unidade.</span></p> : <p className="flex items-start gap-2 text-body-sm text-steel"><LockKeyhole size={17} className="mt-0.5 shrink-0 text-steel" /><span>Este é um adicional da assinatura. A ativação só será liberada após a contratação.</span></p>}
                </div>

                <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-label text-steel">A cobrança e o atendimento da recepção serão configurados na próxima etapa.</p>
                  <Button variant={modulo.ativo ? 'danger' : 'primary'} disabled={!modulo.contratado} loading={saving === modulo.chave} onClick={() => toggle(modulo)}>{modulo.ativo ? 'Desativar' : modulo.contratado ? 'Ativar na unidade' : 'Contratação necessária'}</Button>
                </div>
              </Card>
            })}
          </div>
        )}
      </section>

      <ReceptionUsersPanel enabled={modules.some((modulo) => modulo.chave === 'recepcao' && modulo.ativo)} />
    </div>
  )
}
