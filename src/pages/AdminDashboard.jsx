import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Landmark,
  RefreshCw,
  Scissors,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { listarAgendaAdminPeriodo } from '../lib/agenda/api'
import { dataLocalKey, statusAgenda } from '../lib/agenda/ui'
import { listarBarbeiros } from '../lib/barbeiros/api'
import { obterResumoPeriodo } from '../lib/financeiro/api'
import { formatarBRL } from '../lib/financeiro/moeda'
import { periodoMensalBrt } from '../lib/financeiro/periodo'

function formatarHorario(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function nomeProfissional(row) {
  return row.profissional_apelido || row.profissional_nome || 'Profissional'
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const today = dataLocalKey()
  const [summary, setSummary] = useState(null)
  const [appointments, setAppointments] = useState([])
  const [barbers, setBarbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const now = new Date()
      const month = periodoMensalBrt(now.getFullYear(), now.getMonth() + 1)
      const [financeData, dayAppointments, team] = await Promise.all([
        obterResumoPeriodo({ dataInicio: month.inicio, dataFim: month.fim }),
        listarAgendaAdminPeriodo(today, today),
        listarBarbeiros({ incluirInativos: true }),
      ])
      setSummary(financeData)
      setAppointments(dayAppointments)
      setBarbers(team)
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível carregar o painel.')
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  const finance = summary?.totais ?? { entradas: 0, saidas: 0, resultado: 0 }
  const balance = (summary?.contas ?? []).reduce((total, account) => total + Number(account.saldo_atual), 0)
  const operational = useMemo(() => ({
    scheduled: appointments.filter((row) => !['cancelado', 'concluido'].includes(row.status)).length,
    active: appointments.filter((row) => row.status === 'em_atendimento').length,
    done: appointments.filter((row) => row.status === 'concluido').length,
    barbers: barbers.filter((row) => row.ativo).length,
  }), [appointments, barbers])
  const nextAppointments = appointments
    .filter((row) => !['cancelado', 'concluido'].includes(row.status))
    .slice(0, 6)

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="mb-2 block text-label text-copper">DADOS REAIS DA BARBEARIA</span>
          <h1 className="text-h1 text-warm-white sm:text-display">Painel administrativo</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-steel sm:text-body">Financeiro do mês e operação de hoje, diretamente dos cadastros do sistema.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex">
          <Button variant="secondary" size="lg" onClick={() => navigate('/admin/agenda')}><CalendarDays size={18} /> Abrir agenda</Button>
          <Button size="lg" onClick={() => navigate('/admin/financeiro')}><WalletCards size={18} /> Ver financeiro</Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <span>Não foi possível carregar os dados reais do painel.</span>
          <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={15} /> Tentar novamente</Button>
        </div>
      )}

      {loading ? (
        <Card className="flex min-h-64 items-center justify-center gap-3 text-body text-steel"><Spinner size={24} /> Carregando dados reais</Card>
      ) : error ? null : (
        <>
          <section aria-label="Resumo financeiro real" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Card.Metric label="Saldo em contas" value={formatarBRL(balance)} />
            <Card.Metric label="Entradas no mês" value={formatarBRL(finance.entradas)} badge={<TrendingUp size={16} className="text-success" />} />
            <Card.Metric label="Saídas no mês" value={formatarBRL(finance.saidas)} badge={<TrendingDown size={16} className="text-warning" />} />
            <Card.Metric label="Resultado do mês" value={formatarBRL(finance.resultado)} badge={<Badge variant={Number(finance.resultado) < 0 ? 'danger' : 'success'}>{Number(finance.resultado) < 0 ? 'Negativo' : 'Positivo'}</Badge>} />
          </section>

          <section aria-label="Resumo operacional real" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Agenda hoje', operational.scheduled, <Clock3 size={17} className="mb-2 text-warning" aria-hidden="true" />],
              ['Atendendo', operational.active, <Scissors size={17} className="mb-2 text-copper" aria-hidden="true" />],
              ['Concluídos', operational.done, <CheckCircle2 size={17} className="mb-2 text-success" aria-hidden="true" />],
              ['Barbeiros ativos', operational.barbers, <Users size={17} className="mb-2 text-info" aria-hidden="true" />],
            ].map(([label, value, icon]) => (
              <Card key={label} className="min-w-0 p-4">
                {icon}
                <span className="block text-data-lg text-warm-white">{value}</span>
                <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-steel sm:text-label">{label}</span>
              </Card>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
            <Card className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <span className="text-label text-copper">HOJE</span>
                  <h2 className="mt-1 text-h2 text-warm-white">Próximos atendimentos</h2>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/admin/agenda')}>Agenda <ArrowRight size={15} /></Button>
              </div>
              {nextAppointments.length === 0 ? (
                <EmptyState icon={CalendarDays} title="Nenhum atendimento pendente" description="A agenda de hoje está livre ou todos os atendimentos já foram concluídos." />
              ) : (
                <div className="divide-y divide-line">
                  {nextAppointments.map((appointment) => {
                    const status = statusAgenda(appointment.status)
                    return (
                      <article key={appointment.id} className="flex min-w-0 items-center gap-3 py-3">
                        <time className="w-12 shrink-0 text-data text-copper" dateTime={appointment.data_hora}>{formatarHorario(appointment.data_hora)}</time>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-semibold text-warm-white">{appointment.cliente_nome}</p>
                          <p className="truncate text-body-sm text-steel">{nomeProfissional(appointment)} · {appointment.servico_nome}</p>
                        </div>
                        <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
                      </article>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <span className="text-label text-copper">FINANCEIRO</span>
                  <h2 className="mt-1 text-h2 text-warm-white">Contas cadastradas</h2>
                </div>
                <Landmark size={20} className="text-steel" aria-hidden="true" />
              </div>
              {(summary?.contas ?? []).length === 0 ? (
                <EmptyState icon={Landmark} title="Nenhuma conta ativa" description="Cadastre uma conta para iniciar o acompanhamento financeiro." />
              ) : (
                <div className="space-y-3">
                  {summary.contas.slice(0, 5).map((account) => (
                    <div key={account.id} className="flex items-center justify-between gap-3 rounded-sm border border-line bg-surface-0 p-3">
                      <span className="truncate text-body-sm text-warm-white">{account.nome}</span>
                      <span className="shrink-0 text-data text-warm-white">{formatarBRL(account.saldo_atual)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
