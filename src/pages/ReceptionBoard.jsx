import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Clock3, Headset, LogOut, Phone, RefreshCw, Scissors, Search, UserRound } from 'lucide-react'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import EmptyState from '../components/ui/EmptyState'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import { dataLocalKey, statusAgenda } from '../lib/agenda/ui'
import { listarDisponibilidadeOperacional } from '../lib/disponibilidade/api'
import { buscarClientesRecepcao, listarAgendaRecepcao, mensagemErroRecepcao } from '../lib/recepcao/api'
import { supabase } from '../lib/supabase'

function addDays(key, amount) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return dataLocalKey(date)
}

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatDay(value) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(value))
}

function appointmentName(item) {
  return item.profissional_apelido || item.profissional_nome || 'Profissional'
}

export default function ReceptionBoard() {
  const navigate = useNavigate()
  const today = dataLocalKey()
  const [view, setView] = useState('hoje')
  const [appointments, setAppointments] = useState([])
  const [availability, setAvailability] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [clientResults, setClientResults] = useState([])
  const [searchError, setSearchError] = useState('')

  const endDate = view === 'hoje' ? today : addDays(today, 6)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [agenda, team] = await Promise.all([
        listarAgendaRecepcao(today, endDate),
        listarDisponibilidadeOperacional({ dataInicial: today, dataFinal: endDate }),
      ])
      setAppointments(agenda)
      setAvailability(team)
    } catch (loadError) {
      setError(mensagemErroRecepcao(loadError))
    } finally {
      setLoading(false)
    }
  }, [endDate, today])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => ({
    hoje: appointments.filter((item) => dataLocalKey(new Date(item.data_hora)) === today).length,
    confirmados: appointments.filter((item) => item.status === 'confirmado').length,
    atendimento: appointments.filter((item) => item.status === 'em_atendimento').length,
    conflitos: availability.reduce((total, item) => total + (item.conflitos?.length || 0), 0),
  }), [appointments, availability, today])

  async function search(event) {
    event.preventDefault()
    setSearching(true)
    setSearchError('')
    try {
      setClientResults(await buscarClientesRecepcao(query))
    } catch (searchFailure) {
      setSearchError(mensagemErroRecepcao(searchFailure))
      setClientResults([])
    } finally {
      setSearching(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-surface-0 text-warm-white">
      <header className="sticky top-0 z-20 border-b border-line bg-surface-1/95 backdrop-blur-md">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-copper text-surface-0"><Headset size={21} /></span>
            <div className="min-w-0"><h1 className="truncate text-h3 text-warm-white">Recepção</h1><p className="text-label text-steel">Operação do balcão</p></div>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut size={16} /> <span className="hidden sm:inline">Sair</span></Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><span className="text-label text-copper">VISÃO OPERACIONAL</span><h2 className="mt-2 text-h1 text-warm-white sm:text-display">Agenda da equipe</h2><p className="mt-1 text-body-sm text-steel">Horários e contatos necessários para atender o cliente.</p></div>
          <div className="grid grid-cols-2 gap-2 rounded-sm border border-line bg-surface-1 p-1"><Button size="sm" variant={view === 'hoje' ? 'primary' : 'ghost'} onClick={() => setView('hoje')}>Hoje</Button><Button size="sm" variant={view === 'semana' ? 'primary' : 'ghost'} onClick={() => setView('semana')}>7 dias</Button></div>
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo operacional">
          {[
            ['Horários hoje', stats.hoje, <CalendarDays key="agenda" size={18} className="mb-2 text-copper" />],
            ['Confirmados', stats.confirmados, <UserRound key="confirmados" size={18} className="mb-2 text-copper" />],
            ['Em atendimento', stats.atendimento, <Scissors key="atendimento" size={18} className="mb-2 text-copper" />],
            ['Conflitos', stats.conflitos, <Clock3 key="conflitos" size={18} className="mb-2 text-copper" />],
          ].map(([label, value, icon]) => <Card key={label} className="p-4">{icon}<span className="block text-data-lg text-warm-white">{value}</span><span className="text-label text-steel">{label}</span></Card>)}
        </section>

        <Card className="p-4 sm:p-5">
          <form onSubmit={search} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Input label="Encontrar cliente" icon={Search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou telefone" /></div><Button type="submit" loading={searching}>Buscar</Button></form>
          {searchError && <p role="alert" className="mt-3 text-body-sm text-danger">{searchError}</p>}
          {clientResults.length > 0 && <div className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 md:grid-cols-2">{clientResults.map((client) => <div key={client.id} className="rounded-sm border border-line bg-surface-0 p-3"><p className="font-semibold text-warm-white">{client.nome}</p>{client.telefone ? <a className="mt-1 inline-flex min-h-9 items-center gap-2 text-body-sm text-info" href={`tel:${client.telefone}`}><Phone size={14} /> {client.telefone}</a> : <p className="mt-1 text-body-sm text-steel">Telefone não informado</p>}{client.proximo_horario && <p className="mt-1 text-label text-steel">Próximo: {formatDay(client.proximo_horario)} às {formatTime(client.proximo_horario)}</p>}</div>)}</div>}
        </Card>

        {error && <div role="alert" className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger/10 p-4 text-body-sm text-danger sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button size="sm" variant="danger" onClick={load}><RefreshCw size={15} /> Tentar novamente</Button></div>}
        {loading ? <Card className="flex min-h-56 items-center justify-center gap-3 text-steel"><Spinner size={22} /> Carregando agenda</Card> : appointments.length === 0 ? <Card><EmptyState icon={CalendarDays} title="Nenhum horário neste período" description="Os novos horários aparecerão aqui automaticamente quando forem cadastrados." /></Card> : (
          <section className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Horários da equipe">
            {appointments.map((item) => {
              const status = statusAgenda(item.status)
              return <Card key={item.id} className="p-4"><div className="flex items-start gap-3"><div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-sm bg-surface-2 text-copper"><Clock3 size={14} /><time className="mt-1 text-data" dateTime={item.data_hora}>{formatTime(item.data_hora)}</time></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-h3 text-warm-white">{item.cliente_nome}</p><p className="mt-1 truncate text-body-sm font-semibold text-copper">{appointmentName(item)}</p></div><Badge variant={status.variant} className="shrink-0">{status.label}</Badge></div><p className="mt-2 text-body-sm text-steel">{item.servico_nome} · {item.duracao_minutos} min{view === 'semana' ? ` · ${formatDay(item.data_hora)}` : ''}</p>{item.cliente_telefone && <a href={`tel:${item.cliente_telefone}`} className="mt-2 inline-flex min-h-9 items-center gap-2 text-body-sm text-info"><Phone size={14} /> Ligar para o cliente</a>}</div></div></Card>
            })}
          </section>
        )}
      </main>
    </div>
  )
}
