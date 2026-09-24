import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarCheck, CalendarDays, Camera, Check, CheckCircle2, ChevronRight,
  Clock3, CreditCard, History, Home, LogOut, MapPin, Pencil, Phone, RefreshCw,
  Scissors, ShieldCheck, Sparkles, UserRound, UsersRound,
} from 'lucide-react'
import garagemSymbol from '../assets/brand/garagem-symbol.png'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import Spinner from '../components/ui/Spinner'
import {
  acessarPortal, atualizarPerfilPortal, cancelarAgendamentoPortal, carregarBarbeariaPortal,
  carregarDadosPortal, cadastrarNoPortal, criarAgendamentoPortal, encerrarPortal, erroPortal,
  listarHorariosPortal, portalSessionKey,
} from '../lib/portal/api'

const TABS = [
  { id: 'inicio', label: 'Início', icon: <Home size={19} /> },
  { id: 'agendar', label: 'Agendar', icon: <CalendarDays size={19} /> },
  { id: 'historico', label: 'Cortes', icon: <Scissors size={19} /> },
  { id: 'equipe', label: 'Equipe', icon: <UsersRound size={19} /> },
  { id: 'perfil', label: 'Perfil', icon: <UserRound size={19} /> },
]

function onlyDigits(value, max) {
  return String(value ?? '').replace(/\D/g, '').slice(0, max)
}

function maskCpf(value) {
  const digits = onlyDigits(value, 11)
  return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function maskPhone(value) {
  const digits = onlyDigits(value, 11)
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0))
}

function fullDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(value))
}

function shortDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function time(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function statusLabel(status) {
  return { pendente: 'Aguardando confirmação', confirmado: 'Confirmado', encaixe: 'Encaixe', em_atendimento: 'Em atendimento', aguardando_pagamento: 'Aguardando pagamento', concluido: 'Concluído', cancelado: 'Cancelado' }[status] || status
}

function Brand({ shop, compact = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`${compact ? 'h-9 w-9' : 'h-12 w-12'} flex shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10`}>
        <img src={shop?.logo_url || garagemSymbol} alt="" className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} object-contain`} />
      </div>
      <div className="min-w-0"><p className="truncate font-display text-lg font-semibold text-warm-white">{shop?.nome || 'Garagem'}</p><p className="text-[10px] font-mono uppercase tracking-[0.18em] text-copper">Portal do cliente</p></div>
    </div>
  )
}

function Feedback({ type = 'error', children }) {
  if (!children) return null
  const style = type === 'success' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'
  return <div role={type === 'success' ? 'status' : 'alert'} className={`rounded-md border p-3 text-body-sm ${style}`}>{children}</div>
}

function AccessScreen({ shop, slug, onAuthenticated }) {
  const [mode, setMode] = useState('access')
  const [cpf, setCpf] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function access(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await acessarPortal(slug, cpf)
      if (result.status === 'cadastro') setMode('register')
      else onAuthenticated(result.token)
    } catch (requestError) { setError(erroPortal(requestError).message) }
    finally { setBusy(false) }
  }

  async function register(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result = await cadastrarNoPortal({ slug, cpf, nome: name, telefone: phone })
      onAuthenticated(result.token)
    } catch (requestError) { setError(erroPortal(requestError).message) }
    finally { setBusy(false) }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-surface-0 px-4 py-6 sm:px-6 lg:flex lg:items-center lg:py-10">
      <div className="atmosphere-vignette absolute inset-0 opacity-40" />
      <div className="absolute left-0 top-0 h-1 w-full bg-linear-to-r from-copper via-gold-aged to-copper" />
      <div className="relative mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <section className="pt-4 lg:pr-12">
          <Brand shop={shop} />
          <span className="mt-12 block text-label text-copper">SEU CORTE, DO SEU JEITO</span>
          <h1 className="mt-3 max-w-xl font-display text-4xl font-semibold leading-[1.05] text-warm-white sm:text-5xl">Sua barbearia sempre com você.</h1>
          <p className="mt-5 max-w-lg text-body text-steel sm:text-base">Agende seu horário, escolha seu barbeiro e consulte como foi seu último corte — sem instalar nada.</p>
          <div className="mt-8 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
            {[[<CalendarCheck key="agenda" size={18} className="mb-3 text-copper" />, 'Agenda fácil'],[<Scissors key="history" size={18} className="mb-3 text-copper" />, 'Seu histórico'],[<ShieldCheck key="security" size={18} className="mb-3 text-copper" />, 'Acesso seguro']].map(([icon, label]) => <div key={label} className="rounded-md border border-line bg-surface-1/80 p-3">{icon}<span className="block text-[11px] font-semibold text-warm-white sm:text-body-sm">{label}</span></div>)}
          </div>
        </section>

        <Card className="relative p-5 shadow-overlay sm:p-8">
          {mode === 'register' && <button type="button" className="mb-5 inline-flex min-h-10 items-center gap-2 text-body-sm text-steel hover:text-copper" onClick={() => { setMode('access'); setError('') }}><ArrowLeft size={16} /> Voltar</button>}
          <p className="text-label text-copper">{mode === 'access' ? 'ENTRAR OU CRIAR CONTA' : 'PRIMEIRO ACESSO'}</p>
          <h2 className="mt-2 text-h1 text-warm-white">{mode === 'access' ? 'Que bom ter você aqui.' : 'Complete seu cadastro.'}</h2>
          <p className="mt-2 text-body-sm text-steel">{mode === 'access' ? 'Digite seu CPF. Se você ainda não tiver cadastro, poderá criá-lo agora.' : 'Não encontramos esse CPF. Leva menos de um minuto.'}</p>
          <Feedback>{error}</Feedback>
          {mode === 'access' ? (
            <form className="mt-6 space-y-5" onSubmit={access}>
              <Input label="CPF" inputMode="numeric" autoComplete="off" value={maskCpf(cpf)} onChange={(event) => setCpf(onlyDigits(event.target.value, 11))} placeholder="000.000.000-00" helpText="Use um CPF válido. Ele identifica seu cadastro com segurança nesta barbearia." />
              <Button type="submit" size="lg" loading={busy} disabled={cpf.length !== 11} className="w-full">Continuar <ChevronRight size={18} /></Button>
              <p className="text-center text-xs leading-relaxed text-steel">Primeiro acesso? É por aqui mesmo — o cadastro abre automaticamente.</p>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={register}>
              <Input label="CPF" value={maskCpf(cpf)} disabled />
              <Input label="Nome completo" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Como podemos chamar você?" />
              <Input label="WhatsApp" type="tel" inputMode="tel" autoComplete="tel" value={maskPhone(phone)} onChange={(event) => setPhone(onlyDigits(event.target.value, 11))} placeholder="(00) 00000-0000" />
              <Button type="submit" size="lg" loading={busy} disabled={name.trim().length < 2 || phone.length < 10} className="w-full">Criar acesso <Check size={18} /></Button>
              <p className="text-center text-xs leading-relaxed text-steel">Ao continuar, seus dados ficam disponíveis somente para esta barbearia.</p>
            </form>
          )}
        </Card>
      </div>
    </main>
  )
}

function AppointmentCard({ appointment, cancelling, onCancel }) {
  const canCancel = ['pendente','confirmado'].includes(appointment.status) && new Date(appointment.data_hora) > new Date()
  return (
    <article className="rounded-md border border-line bg-surface-1 p-4 sm:p-5">
      <div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-sm bg-copper/10 text-copper"><span className="text-[10px] font-mono uppercase">{shortDate(appointment.data_hora).split(' ')[1]}</span><strong className="text-lg leading-none">{new Date(appointment.data_hora).getDate()}</strong></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-h3 text-warm-white">{appointment.servico_nome}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${appointment.status === 'confirmado' ? 'bg-success/12 text-success' : 'bg-warning/12 text-warning'}`}>{statusLabel(appointment.status)}</span></div><p className="mt-1 text-body-sm text-steel">{fullDate(appointment.data_hora)} às {time(appointment.data_hora)}</p><p className="mt-1 text-body-sm text-steel">com <span className="text-warm-white">{appointment.profissional_nome}</span> · {money(appointment.valor_final)}</p></div></div>
      {canCancel && <div className="mt-4 border-t border-line pt-3 text-right"><Button size="sm" variant="ghost" loading={cancelling} onClick={() => onCancel(appointment)}>Cancelar horário</Button></div>}
    </article>
  )
}

function HomeView({ data, onNavigate, onCancel, cancelling }) {
  const next = data.agendamentos.filter((item) => new Date(item.data_hora) >= new Date())
  const lastCut = data.historico[0]
  return (
    <div className="space-y-6">
      <section className="rounded-md border border-copper/25 bg-linear-to-br from-copper/14 to-surface-1 p-5 sm:p-7"><p className="text-label text-copper">OLÁ, {data.cliente.nome.split(' ')[0].toUpperCase()}</p><h1 className="mt-2 font-display text-3xl font-semibold text-warm-white">Pronto para o próximo corte?</h1><p className="mt-2 text-body-sm text-steel">Escolha o serviço e encontre o melhor horário para você.</p><Button size="lg" className="mt-6 w-full sm:w-auto" onClick={() => onNavigate('agendar')}><CalendarDays size={18} /> Agendar agora</Button></section>
      <section><div className="mb-3 flex items-center justify-between"><div><p className="text-label text-steel">PRÓXIMOS HORÁRIOS</p><h2 className="mt-1 text-h2 text-warm-white">Sua agenda</h2></div><CalendarCheck className="text-copper" size={22} /></div>{next.length ? <div className="space-y-3">{next.slice(0,3).map((item) => <AppointmentCard key={item.id} appointment={item} cancelling={cancelling === item.id} onCancel={onCancel} />)}</div> : <Card className="p-5 text-center"><CalendarDays size={25} className="mx-auto text-steel" /><p className="mt-3 text-body font-semibold text-warm-white">Nenhum horário marcado</p><p className="mt-1 text-body-sm text-steel">Sua agenda está livre para o próximo cuidado.</p></Card>}</section>
      <section><div className="mb-3"><p className="text-label text-steel">MEMÓRIA DO SEU ESTILO</p><h2 className="mt-1 text-h2 text-warm-white">Último corte</h2></div>{lastCut ? <Card className="p-5"><div className="flex items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-copper/10 text-copper">{lastCut.tem_foto ? <Camera size={22} /> : <Scissors size={22} />}</div><div className="min-w-0"><h3 className="text-h3 text-warm-white">{lastCut.estilo}</h3><p className="mt-1 text-body-sm text-steel">{shortDate(lastCut.criado_em)} · {lastCut.profissional_nome}</p><p className="mt-2 text-body-sm text-warm-white">{[lastCut.pentes,lastCut.acabamento,lastCut.barba].filter(Boolean).join(' · ') || 'Detalhes registrados pela equipe'}</p></div></div><Button variant="secondary" className="mt-4 w-full" onClick={() => onNavigate('historico')}>Ver histórico completo</Button></Card> : <Card className="p-5 text-center"><Sparkles size={24} className="mx-auto text-copper" /><p className="mt-3 text-body font-semibold text-warm-white">Seu histórico começa no próximo corte</p><p className="mt-1 text-body-sm text-steel">A equipe poderá registrar detalhes para repetir seu estilo favorito.</p></Card>}</section>
    </div>
  )
}

function BookingView({ data, token, onBooked }) {
  const [serviceId, setServiceId] = useState('')
  const [barberId, setBarberId] = useState(data.cliente.barbeiro_favorito_id || '')
  const [startDate, setStartDate] = useState(localDateKey())
  const [slots, setSlots] = useState([])
  const [selected, setSelected] = useState(null)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const service = data.servicos.find((item) => item.id === serviceId)
  const grouped = useMemo(() => slots.reduce((result, slot) => { const key = localDateKey(new Date(slot.inicio)); (result[key] ||= []).push(slot); return result }, {}), [slots])

  async function search() {
    if (!serviceId) return
    setSearching(true); setSearched(false); setError(''); setSlots([]); setSelected(null)
    try { setSlots(await listarHorariosPortal({ token, servicoId: serviceId, dataInicial: startDate, profissionalId: barberId || null, dias: 14 })) }
    catch (requestError) { setError(erroPortal(requestError).message) }
    finally { setSearching(false); setSearched(true) }
  }

  async function confirm() {
    if (!selected) return
    setSaving(true); setError('')
    try { await criarAgendamentoPortal({ token, servicoId: serviceId, profissionalId: selected.profissional_id, inicio: selected.inicio }); onBooked() }
    catch (requestError) { const parsed = erroPortal(requestError); setError(parsed.message); if (parsed.code === 'PORTAL_HORARIO_INDISPONIVEL') await search() }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6"><header><p className="text-label text-copper">NOVO AGENDAMENTO</p><h1 className="mt-2 text-h1 text-warm-white sm:text-display">Escolha seu momento</h1><p className="mt-2 text-body-sm text-steel">Serviço, profissional e horário — simples assim.</p></header><Feedback>{error}</Feedback>
      <section><p className="mb-3 text-label text-steel">1 · O QUE VAMOS FAZER?</p><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{data.servicos.map((item) => <button key={item.id} type="button" onClick={() => { setServiceId(item.id); setSlots([]); setSelected(null) }} className={`min-h-24 rounded-md border p-4 text-left transition ${serviceId === item.id ? 'border-copper bg-copper/10' : 'border-line bg-surface-1 hover:border-line-strong'}`}><div className="flex items-start justify-between gap-3"><div><strong className="text-body text-warm-white">{item.nome}</strong><p className="mt-1 line-clamp-2 text-body-sm text-steel">{item.descricao || 'Cuidado completo com a equipe.'}</p></div>{serviceId === item.id && <CheckCircle2 size={19} className="shrink-0 text-copper" />}</div><div className="mt-3 flex gap-4 text-xs font-mono text-steel"><span>{money(item.preco)}</span><span>{item.duracao_minutos} min</span></div></button>)}</div></section>
      <section><p className="mb-3 text-label text-steel">2 · COM QUEM?</p><div className="flex gap-2 overflow-x-auto pb-2"><button type="button" onClick={() => { setBarberId(''); setSlots([]) }} className={`min-h-12 shrink-0 rounded-full border px-4 text-body-sm font-semibold ${!barberId ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-1 text-steel'}`}>Primeiro disponível</button>{data.equipe.map((barber) => <button key={barber.id} type="button" onClick={() => { setBarberId(barber.id); setSlots([]) }} className={`min-h-12 shrink-0 rounded-full border px-4 text-body-sm font-semibold ${barberId === barber.id ? 'border-copper bg-copper/10 text-copper' : 'border-line bg-surface-1 text-steel'}`}>{barber.apelido || barber.nome}{data.cliente.barbeiro_favorito_id === barber.id ? ' ★' : ''}</button>)}</div></section>
      <section className="rounded-md border border-line bg-surface-1 p-4"><p className="mb-3 text-label text-steel">3 · A PARTIR DE QUANDO?</p><div className="flex flex-col gap-3 sm:flex-row"><input type="date" min={localDateKey()} value={startDate} onChange={(event) => { setStartDate(event.target.value); setSlots([]) }} className="h-12 flex-1 rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none focus:border-copper" /><Button size="lg" className="sm:min-w-48" loading={searching} disabled={!serviceId} onClick={search}><RefreshCw size={17} /> Ver horários</Button></div></section>
      {serviceId && !searching && slots.length === 0 && <Card className="p-5 text-center"><Clock3 size={24} className="mx-auto text-steel" /><p className="mt-3 text-body font-semibold text-warm-white">{searched ? 'Nenhum horário encontrado' : 'Busque os horários disponíveis'}</p><p className="mt-1 text-body-sm text-steel">{searched ? 'Tente outra data ou selecione o primeiro profissional disponível.' : 'Mostraremos as opções reais dos próximos 14 dias.'}</p></Card>}
      {Object.entries(grouped).map(([date, items]) => <section key={date}><p className="mb-3 capitalize text-body font-semibold text-warm-white">{fullDate(`${date}T12:00:00`)}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{items.map((slot) => <button key={`${slot.profissional_id}-${slot.inicio}`} type="button" onClick={() => setSelected(slot)} className={`min-h-16 rounded-md border p-2 text-center ${selected?.inicio === slot.inicio && selected?.profissional_id === slot.profissional_id ? 'border-copper bg-copper/10' : 'border-line bg-surface-1 hover:border-line-strong'}`}><strong className="block font-mono text-base text-warm-white">{time(slot.inicio)}</strong><span className="mt-1 block truncate text-xs text-steel">{slot.profissional_apelido || slot.profissional_nome}</span></button>)}</div></section>)}
      {selected && <section className="sticky bottom-20 z-20 rounded-md border border-copper bg-surface-2 p-4 shadow-overlay sm:bottom-6"><div className="flex items-start justify-between gap-3"><div><p className="text-label text-copper">CONFIRMAR HORÁRIO</p><h3 className="mt-1 text-h3 text-warm-white">{service?.nome} · {time(selected.inicio)}</h3><p className="mt-1 text-body-sm capitalize text-steel">{fullDate(selected.inicio)} com {selected.profissional_apelido || selected.profissional_nome}</p></div><strong className="shrink-0 font-mono text-warm-white">{money(service?.preco)}</strong></div><div className="mt-4 flex items-center gap-2 rounded-sm bg-surface-0 p-3 text-xs text-steel"><CreditCard size={16} className="shrink-0 text-copper" /> Pagamento antecipado será habilitado quando a barbearia conectar o provedor. Por enquanto, pague no local.</div><Button size="lg" className="mt-4 w-full" loading={saving} onClick={confirm}>Confirmar agendamento <Check size={18} /></Button></section>}
    </div>
  )
}

function HistoryView({ history }) {
  return <div className="space-y-5"><header><p className="text-label text-copper">MEMÓRIA DE CORTES</p><h1 className="mt-2 text-h1 text-warm-white sm:text-display">Seu estilo, sempre lembrado</h1><p className="mt-2 text-body-sm text-steel">Detalhes registrados pela equipe para manter o resultado que você gosta.</p></header>{history.length ? <div className="space-y-3">{history.map((cut, index) => <Card key={cut.id} className={`p-4 sm:p-5 ${index === 0 ? 'border-copper/50' : ''}`}><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-copper/10 text-copper">{cut.tem_foto ? <Camera size={20} /> : <Scissors size={20} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-h3 text-warm-white">{cut.estilo}</h2>{index === 0 && <span className="rounded-full bg-success/12 px-2 py-1 text-[10px] font-mono uppercase text-success">Último corte</span>}</div><p className="mt-1 text-body-sm text-steel">{shortDate(cut.criado_em)} · {cut.profissional_nome} · {cut.servico_nome}</p><dl className="mt-4 grid grid-cols-2 gap-3 rounded-sm border border-line bg-surface-0 p-3 text-body-sm">{cut.pentes && <div><dt className="text-label text-steel">PENTES</dt><dd className="mt-1 text-warm-white">{cut.pentes}</dd></div>}{cut.acabamento && <div><dt className="text-label text-steel">ACABAMENTO</dt><dd className="mt-1 text-warm-white">{cut.acabamento}</dd></div>}{cut.barba && <div><dt className="text-label text-steel">BARBA</dt><dd className="mt-1 text-warm-white">{cut.barba}</dd></div>}</dl>{cut.observacoes && <p className="mt-3 text-body-sm text-warm-white">{cut.observacoes}</p>}</div></div></Card>)}</div> : <Card className="py-12 text-center"><History size={28} className="mx-auto text-steel" /><h2 className="mt-4 text-h3 text-warm-white">Nenhum corte registrado ainda</h2><p className="mx-auto mt-2 max-w-sm text-body-sm text-steel">Depois do primeiro atendimento, os detalhes aparecem aqui.</p></Card>}</div>
}

function TeamView({ team, favoriteId }) {
  return <div className="space-y-5"><header><p className="text-label text-copper">NOSSA EQUIPE</p><h1 className="mt-2 text-h1 text-warm-white sm:text-display">Quem cuida do seu estilo</h1><p className="mt-2 text-body-sm text-steel">Conheça os profissionais disponíveis nesta unidade.</p></header><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{team.map((barber) => <Card key={barber.id} className="p-5"><div className="flex items-center gap-4">{barber.foto_url ? <img src={barber.foto_url} alt={barber.apelido || barber.nome} className="h-16 w-16 rounded-md object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-copper/30 bg-copper/10 font-display text-2xl text-copper">{(barber.apelido || barber.nome).charAt(0)}</div>}<div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-h3 text-warm-white">{barber.apelido || barber.nome}</h2>{favoriteId === barber.id && <span className="text-xs text-copper">★ favorito</span>}</div><p className="mt-1 text-body-sm text-steel">{barber.especialidade || 'Barbeiro da equipe'}</p></div></div></Card>)}</div></div>
}

function ProfileView({ data, token, onUpdated, onLogout }) {
  const [form, setForm] = useState({ nome: data.cliente.nome, telefone: data.cliente.telefone || '', barbeiro: data.cliente.barbeiro_favorito_id || '', preferencias: data.cliente.notas_preferencias || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function save(event) { event.preventDefault(); setSaving(true); setError(''); setNotice(''); try { await atualizarPerfilPortal({ token, nome: form.nome, telefone: form.telefone, barbeiroFavoritoId: form.barbeiro, notasPreferencias: form.preferencias }); setNotice('Seu perfil foi atualizado.'); await onUpdated() } catch (requestError) { setError(erroPortal(requestError).message) } finally { setSaving(false) } }
  return <div className="space-y-5"><header><p className="text-label text-copper">SEU PERFIL</p><h1 className="mt-2 text-h1 text-warm-white sm:text-display">Preferências pessoais</h1><p className="mt-2 text-body-sm text-steel">Ajude a equipe a preparar um atendimento cada vez melhor.</p></header><Feedback>{error}</Feedback><Feedback type="success">{notice}</Feedback><form className="space-y-4 rounded-md border border-line bg-surface-1 p-4 sm:p-6" onSubmit={save}><Input label="Nome" autoComplete="name" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /><Input label="WhatsApp" type="tel" value={maskPhone(form.telefone)} onChange={(event) => setForm({ ...form, telefone: onlyDigits(event.target.value, 11) })} /><div><label htmlFor="favorite-barber" className="mb-2 block text-label text-steel">Barbeiro favorito</label><select id="favorite-barber" value={form.barbeiro} onChange={(event) => setForm({ ...form, barbeiro: event.target.value })} className="h-11 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none focus:border-copper"><option value="">Sem preferência</option>{data.equipe.map((barber) => <option key={barber.id} value={barber.id}>{barber.apelido || barber.nome}</option>)}</select></div><div><label htmlFor="preferences" className="mb-2 block text-label text-steel">Como você gosta do seu corte?</label><textarea id="preferences" rows={5} maxLength={1000} value={form.preferencias} onChange={(event) => setForm({ ...form, preferencias: event.target.value })} placeholder="Ex.: degradê baixo, topo na tesoura, acabamento natural..." className="w-full resize-y rounded-sm border border-line-strong bg-surface-2 px-3 py-3 text-body text-warm-white outline-none focus:border-copper" /></div><Button type="submit" size="lg" loading={saving} className="w-full sm:w-auto"><Check size={17} /> Salvar preferências</Button></form><Card className="p-4"><div className="flex items-center gap-3"><ShieldCheck size={21} className="text-success" /><div><p className="text-body font-semibold text-warm-white">CPF protegido</p><p className="text-body-sm text-steel">Identificação final •{data.cliente.cpf_final}. O número completo não é exibido.</p></div></div></Card><Button variant="danger" size="lg" className="w-full" onClick={onLogout}><LogOut size={17} /> Sair deste dispositivo</Button></div>
}

function PortalApp({ token, initialData, onLogout }) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState('inicio')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState('')
  const refresh = useCallback(async () => { const fresh = await carregarDadosPortal(token); setData(fresh); return fresh }, [token])
  async function cancel(appointment) { if (!window.confirm(`Cancelar ${appointment.servico_nome} em ${shortDate(appointment.data_hora)} às ${time(appointment.data_hora)}?`)) return; setCancelling(appointment.id); setError(''); try { await cancelarAgendamentoPortal(token, appointment.id); await refresh(); setNotice('Agendamento cancelado.') } catch (requestError) { setError(erroPortal(requestError).message) } finally { setCancelling('') } }
  async function booked() { await refresh(); setNotice('Horário solicitado com sucesso. Acompanhe a confirmação por aqui.'); setTab('inicio'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function navigate(next) { setTab(next); setNotice(''); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  return <div className="min-h-dvh bg-surface-0 pb-24"><header className="sticky top-0 z-30 border-b border-line bg-surface-0/95 px-4 py-3 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-4xl items-center justify-between gap-3"><Brand compact shop={data.barbearia} /><button type="button" aria-label="Sair" className="flex h-10 w-10 items-center justify-center rounded-full text-steel hover:bg-surface-2 hover:text-copper" onClick={onLogout}><LogOut size={18} /></button></div></header><main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8"><Feedback>{error}</Feedback><Feedback type="success">{notice}</Feedback><div className={(error || notice) ? 'mt-5' : ''}>{tab === 'inicio' && <HomeView data={data} onNavigate={navigate} onCancel={cancel} cancelling={cancelling} />}{tab === 'agendar' && <BookingView data={data} token={token} onBooked={booked} />}{tab === 'historico' && <HistoryView history={data.historico} />}{tab === 'equipe' && <TeamView team={data.equipe} favoriteId={data.cliente.barbeiro_favorito_id} />}{tab === 'perfil' && <ProfileView data={data} token={token} onUpdated={refresh} onLogout={onLogout} />}</div></main><nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1/98 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur" aria-label="Navegação do portal"><div className="mx-auto grid max-w-xl grid-cols-5">{TABS.map(({ id, label, icon }) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => navigate(id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-sm text-[10px] font-semibold ${tab === id ? 'bg-copper/10 text-copper' : 'text-steel hover:text-warm-white'}`}>{icon}<span>{label}</span></button>)}</div></nav></div>
}

export default function ClientPortal() {
  const { slug = '' } = useParams()
  const normalizedSlug = slug.toLowerCase()
  const [shop, setShop] = useState(null)
  const [token, setToken] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState('')

  const authenticate = useCallback(async (newToken) => {
    localStorage.setItem(portalSessionKey(normalizedSlug), newToken)
    setToken(newToken); setLoading(true); setFatal('')
    try { setData(await carregarDadosPortal(newToken)) }
    catch (requestError) { localStorage.removeItem(portalSessionKey(normalizedSlug)); setToken(''); setFatal(erroPortal(requestError).message) }
    finally { setLoading(false) }
  }, [normalizedSlug])

  useEffect(() => {
    let active = true
    async function boot() {
      setLoading(true); setFatal('')
      try {
        const metadata = await carregarBarbeariaPortal(normalizedSlug)
        if (!active) return
        setShop(metadata)
        const saved = localStorage.getItem(portalSessionKey(normalizedSlug))
        if (saved) {
          try { const portalData = await carregarDadosPortal(saved); if (active) { setToken(saved); setData(portalData) } }
          catch { localStorage.removeItem(portalSessionKey(normalizedSlug)) }
        }
      } catch (requestError) { if (active) setFatal(erroPortal(requestError).message) }
      finally { if (active) setLoading(false) }
    }
    boot(); return () => { active = false }
  }, [normalizedSlug])

  async function logout() {
    const current = token
    localStorage.removeItem(portalSessionKey(normalizedSlug)); setToken(''); setData(null); setFatal('')
    if (current) await encerrarPortal(current).catch(() => {})
  }

  if (loading) return <div className="flex min-h-dvh items-center justify-center bg-surface-0"><div className="text-center"><Spinner size={30} className="mx-auto text-copper" /><p className="mt-4 text-body-sm text-steel">Abrindo seu portal</p></div></div>
  if (fatal && !shop) return <div className="flex min-h-dvh items-center justify-center bg-surface-0 px-4"><Card className="max-w-md p-7 text-center"><MapPin size={28} className="mx-auto text-copper" /><h1 className="mt-4 text-h1 text-warm-white">Portal não encontrado</h1><p className="mt-2 text-body text-steel">{fatal}</p></Card></div>
  if (!token || !data) return <AccessScreen shop={shop} slug={normalizedSlug} onAuthenticated={authenticate} />
  return <PortalApp token={token} initialData={data} onLogout={logout} />
}
