import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, DollarSign, ReceiptText,
  Scissors, ShoppingBag, TrendingDown, TrendingUp, Users,
} from 'lucide-react'
import { atualizarDuracaoServicoPeloExtrato, carregarExtratoBarbeiro } from '../lib/barbeiros/api'
import { periodoExtrato, statusTempo, validarPeriodoExtrato } from '../lib/barbeiros/extrato'
import { formatarBRL } from '../lib/financeiro/moeda'
import Badge from './ui/Badge'
import Button from './ui/Button'
import Card from './ui/Card'
import EmptyState from './ui/EmptyState'
import Input from './ui/Input'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'

const PERIODS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Personalizado' },
]

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function displayName(barber) {
  return barber.apelido || barber.nome
}

function formatMinutes(value, fallback = '—') {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return `${number.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`
}

function dateTime(value) {
  if (!value) return '—'
  return DATE_FORMAT.format(new Date(value))
}

function statusAtendimento(status) {
  if (status === 'concluido') return { label: 'Concluído', variant: 'success' }
  if (status === 'cancelado') return { label: 'Cancelado', variant: 'danger' }
  return { label: 'Não compareceu', variant: 'warning' }
}

function Metric({ icon, label, value, detail }) {
  const MetricIcon = icon
  return (
    <Card className="min-w-0 p-4">
      <MetricIcon size={18} className="mb-3 text-copper" aria-hidden="true" />
      <span className="block break-words text-data-lg text-warm-white">{value}</span>
      <span className="mt-1 block text-label text-steel">{label}</span>
      {detail && <span className="mt-2 block text-body-sm text-steel">{detail}</span>}
    </Card>
  )
}

export default function BarberStatementModal({ barber, onClose }) {
  const initialPeriod = useMemo(() => periodoExtrato(30), [])
  const [periodType, setPeriodType] = useState('30')
  const [draftRange, setDraftRange] = useState(initialPeriod)
  const [range, setRange] = useState(initialPeriod)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [duration, setDuration] = useState('')
  const [savingDuration, setSavingDuration] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await carregarExtratoBarbeiro(barber.id, range.inicio, range.fim))
    } catch (loadError) {
      setError(loadError instanceof TypeError ? loadError.message : 'Não foi possível carregar o extrato deste barbeiro.')
    } finally {
      setLoading(false)
    }
  }, [barber.id, range.fim, range.inicio])

  useEffect(() => { load() }, [load])

  function selectPeriod(value) {
    setPeriodType(value)
    if (value === 'custom') return
    const next = periodoExtrato(Number(value))
    setDraftRange(next)
    setRange(next)
  }

  function applyCustomPeriod() {
    if (!validarPeriodoExtrato(draftRange.inicio, draftRange.fim)) {
      setError('Selecione um período válido de até 367 dias.')
      return
    }
    setError('')
    setRange(draftRange)
  }

  function beginDurationEdit(service) {
    setEditingServiceId(service.servico_id)
    setDuration(String(service.duracao_sugerida_minutos ?? service.duracao_cadastrada_minutos ?? ''))
    setNotice('')
  }

  async function saveDuration(service) {
    setSavingDuration(true)
    setError('')
    try {
      const updated = await atualizarDuracaoServicoPeloExtrato({
        servicoId: service.servico_id,
        duracaoMinutos: Number(duration),
        expectedUpdatedAt: service.servico_updated_at,
      })
      setEditingServiceId(null)
      setNotice(`${service.servico_nome}: duração atualizada para ${updated.duracao_minutos} min. Novos agendamentos usarão esse tempo.`)
      await load()
    } catch (saveError) {
      const detail = [saveError?.message, saveError?.details].filter(Boolean).join(' ')
      setError(detail.includes('EXTRATO_SERVICO_CONFLITO')
        ? 'Esse serviço foi alterado em outra sessão. O panorama foi recarregado.'
        : saveError instanceof TypeError ? saveError.message : 'Não foi possível atualizar a duração do serviço.')
      if (detail.includes('EXTRATO_SERVICO_CONFLITO')) await load()
    } finally {
      setSavingDuration(false)
    }
  }

  const summary = data?.resumo

  return (
    <Modal
      open
      onClose={() => !savingDuration && onClose()}
      title={`Extrato de ${displayName(barber)}`}
      fullScreenMobile
      className="sm:max-w-6xl"
      footer={<Button variant="secondary" onClick={onClose} disabled={savingDuration}>Fechar extrato</Button>}
    >
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-md border border-line bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {barber.foto_url
              ? <img src={barber.foto_url} alt="" className="h-14 w-14 shrink-0 rounded-md border border-line object-cover" />
              : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10 text-h2 text-copper">{displayName(barber).charAt(0).toUpperCase()}</div>}
            <div className="min-w-0">
              <h3 className="truncate text-h3 text-warm-white">{barber.nome}</h3>
              <p className="truncate text-body-sm text-steel">{barber.especialidade || 'Profissional da equipe'}</p>
            </div>
          </div>
          <Badge variant={barber.ativo ? 'success' : 'neutral'}>{barber.ativo ? 'Ativo' : 'Inativo'}</Badge>
        </section>

        <section className="rounded-md border border-line bg-surface-1 p-4" aria-label="Período do extrato">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="block text-label text-steel">
              <span className="mb-2 block">Período</span>
              <select value={periodType} onChange={(event) => selectPeriod(event.target.value)} className="h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white focus:border-copper focus:outline-none focus-visible:ring-2 focus-visible:ring-copper">
                {PERIODS.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
              </select>
            </label>
            <Input label="Data inicial" type="date" value={draftRange.inicio} disabled={periodType !== 'custom'} onChange={(event) => setDraftRange({ ...draftRange, inicio: event.target.value })} />
            <Input label="Data final" type="date" value={draftRange.fim} disabled={periodType !== 'custom'} onChange={(event) => setDraftRange({ ...draftRange, fim: event.target.value })} />
            <Button onClick={applyCustomPeriod} disabled={periodType !== 'custom'}><CalendarDays size={16} /> Aplicar</Button>
          </div>
        </section>

        {notice && <div role="status" className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 p-4 text-body-sm text-success"><CheckCircle2 size={18} className="mt-0.5 shrink-0" />{notice}</div>}
        {error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button size="sm" variant="secondary" onClick={load}>Tentar novamente</Button></div>}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-body text-steel"><Spinner size={24} /> Calculando resultados</div>
        ) : data && summary ? (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo de rendimento">
              <Metric icon={Scissors} label="Atendimentos" value={summary.atendimentos ?? 0} detail={`${summary.clientes_atendidos ?? 0} clientes únicos`} />
              <Metric icon={DollarSign} label="Valor movimentado" value={formatarBRL(summary.valor_total)} detail={`Ticket médio ${formatarBRL(summary.ticket_medio)}`} />
              <Metric icon={ShoppingBag} label="Produtos vendidos" value={summary.produtos_unidades ?? 0} detail={formatarBRL(summary.valor_produtos)} />
              <Metric icon={ReceiptText} label="Comissão estimada" value={formatarBRL(summary.comissao_total)} detail={`${formatarBRL(summary.comissao_servicos)} serviços · ${formatarBRL(summary.comissao_produtos)} produtos`} />
              <Metric icon={Clock3} label="Tempo médio real" value={formatMinutes(summary.tempo_medio_minutos)} detail={`${summary.tempos_medidos ?? 0} atendimentos medidos`} />
              <Metric icon={CheckCircle2} label="Dentro do tempo" value={summary.aderencia_tempo_percentual == null ? '—' : `${Number(summary.aderencia_tempo_percentual).toLocaleString('pt-BR')}%`} detail="Tolerância operacional aplicada" />
              <Metric icon={Users} label="Faltas" value={summary.nao_comparecimentos ?? 0} detail={`${summary.cancelamentos ?? 0} cancelamentos`} />
              <Metric icon={CalendarDays} label="Agendados no período" value={summary.agendados ?? 0} detail={`Atraso médio para iniciar: ${formatMinutes(summary.atraso_medio_inicio_minutos, 'sem medição')}`} />
            </section>

            <section className="space-y-3">
              <div>
                <span className="text-label text-copper">TEMPO POR SERVIÇO</span>
                <h3 className="mt-1 text-h2 text-warm-white">Previsto x realizado</h3>
                <p className="mt-1 text-body-sm text-steel">O alerta considera pelo menos 3 medições e tolerância de 5 minutos ou 10%, o que for maior.</p>
              </div>
              {data.servicos.length === 0 ? (
                <Card><EmptyState icon={Clock3} title="Ainda não há tempo suficiente para analisar" description="Os dados aparecerão quando atendimentos iniciados pelo sistema forem concluídos." /></Card>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {data.servicos.map((service) => {
                    const timeStatus = statusTempo(service.status_tempo)
                    const StatusIcon = service.status_tempo === 'acima' ? TrendingUp : service.status_tempo === 'abaixo' ? TrendingDown : service.status_tempo === 'no_padrao' ? CheckCircle2 : AlertTriangle
                    return (
                      <Card key={service.servico_id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="truncate text-h3 text-warm-white">{service.servico_nome}</h4>
                            <p className="mt-1 text-body-sm text-steel">{service.amostras_tempo} medições em {service.atendimentos} atendimentos</p>
                          </div>
                          <Badge variant={timeStatus.variant}><StatusIcon size={12} className="mr-1" />{timeStatus.label}</Badge>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 rounded-sm border border-line bg-surface-0 p-3 text-center">
                          <div><span className="block text-label text-steel">Cadastrado</span><strong className="mt-1 block text-data text-warm-white">{formatMinutes(service.duracao_cadastrada_minutos)}</strong></div>
                          <div><span className="block text-label text-steel">Média real</span><strong className="mt-1 block text-data text-warm-white">{formatMinutes(service.media_real_minutos)}</strong></div>
                          <div><span className="block text-label text-steel">Diferença</span><strong className={`mt-1 block text-data ${Number(service.diferenca_minutos) > 0 ? 'text-warning' : Number(service.diferenca_minutos) < 0 ? 'text-info' : 'text-success'}`}>{service.diferenca_minutos == null ? '—' : `${Number(service.diferenca_minutos) > 0 ? '+' : ''}${formatMinutes(service.diferenca_minutos)}`}</strong></div>
                        </div>
                        <p className="mt-3 text-body-sm text-steel">{timeStatus.description}</p>
                        {editingServiceId === service.servico_id ? (
                          <div className="mt-4 flex flex-col gap-3 rounded-sm border border-copper/30 bg-copper/5 p-3 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1"><Input label="Nova duração (min)" type="number" min="5" max="480" step="5" value={duration} onChange={(event) => setDuration(event.target.value)} disabled={savingDuration} /></div>
                            <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setEditingServiceId(null)} disabled={savingDuration}>Cancelar</Button><Button size="sm" loading={savingDuration} onClick={() => saveDuration(service)}>Confirmar</Button></div>
                          </div>
                        ) : (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <span className="text-body-sm text-steel">{service.duracao_sugerida_minutos ? `Sugestão baseada na média: ${service.duracao_sugerida_minutos} min` : 'Aguarde 3 medições para receber uma sugestão.'}</span>
                            <Button size="sm" variant="secondary" onClick={() => beginDurationEdit(service)}>Ajustar duração</Button>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div>
                <span className="text-label text-copper">EXTRATO DO PERÍODO</span>
                <h3 className="mt-1 text-h2 text-warm-white">Atendimentos recentes</h3>
              </div>
              {data.extrato.length === 0 ? (
                <Card><EmptyState icon={ReceiptText} title="Nenhum movimento no período" description="Altere o período ou aguarde a conclusão dos próximos atendimentos." /></Card>
              ) : (
                <div className="overflow-hidden rounded-md border border-line">
                  <div className="hidden grid-cols-[1.1fr_1.2fr_1.3fr_.8fr_.8fr_.9fr] gap-3 border-b border-line bg-surface-2 px-4 py-3 text-label text-steel lg:grid">
                    <span>Data</span><span>Cliente</span><span>Serviço</span><span>Tempo</span><span>Status</span><span className="text-right">Movimentado</span>
                  </div>
                  <div className="divide-y divide-line bg-surface-1">
                    {data.extrato.map((item) => {
                      const itemStatus = statusAtendimento(item.status)
                      return (
                        <article key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1.1fr_1.2fr_1.3fr_.8fr_.8fr_.9fr] lg:items-center">
                          <span className="text-data text-steel">{dateTime(item.data_hora)}</span>
                          <strong className="truncate text-body-sm text-warm-white">{item.cliente_nome}</strong>
                          <span className="truncate text-body-sm text-steel">{item.servico_nome}</span>
                          <span className="text-data text-steel">{item.duracao_real_minutos == null ? '—' : `${formatMinutes(item.duracao_real_minutos)} / ${formatMinutes(item.duracao_prevista_minutos)}`}</span>
                          <Badge variant={itemStatus.variant} className="w-fit">{itemStatus.label}</Badge>
                          <div className="lg:text-right"><strong className="block text-data text-warm-white">{formatarBRL(item.valor_total)}</strong>{Number(item.valor_produtos) > 0 && <span className="block text-body-sm text-steel">{formatarBRL(item.valor_produtos)} em produtos</span>}</div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
              {data.extrato.length >= 100 && <p className="text-body-sm text-steel">Exibindo os 100 movimentos mais recentes do período.</p>}
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
