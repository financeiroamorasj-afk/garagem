import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Clock3, RefreshCw, Scissors, UserRound } from 'lucide-react'
import Button from './ui/Button'
import CurrencyInput from './ui/CurrencyInput'
import EmptyState from './ui/EmptyState'
import Input from './ui/Input'
import Label from './ui/Label'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'
import ClientSearch from './ClientSearch'
import {
  carregarCatalogoEncaixe,
  criarClienteRapido,
  criarEncaixe,
  listarHorariosLivres,
  mensagemErroEncaixe,
} from '../lib/agenda/encaixe-api'
import { dataLocalKey } from '../lib/agenda/ui'

const selectClass = 'h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none transition-colors focus:border-copper focus-visible:ring-2 focus-visible:ring-copper'

function nomeProfissional(item) {
  return item.profissional_apelido || item.profissional_nome || item.apelido || item.nome || 'Barbeiro'
}

function formatarDia(value) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    .format(new Date(value))
    .replace('.', '')
}

function formatarHora(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function WalkInModal({ open, onClose, onSuccess, initialDate = null }) {
  const today = dataLocalKey()
  const initialSafeDate = initialDate && initialDate >= today ? initialDate : today
  const searchSequence = useRef(0)
  const [catalog, setCatalog] = useState({ servicos: [], clientes: [], profissionais: [] })
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [phone, setPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [startDate, setStartDate] = useState(initialSafeDate)
  const [price, setPrice] = useState(null)
  const [slots, setSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedService = useMemo(
    () => catalog.servicos.find((item) => item.id === serviceId),
    [catalog.servicos, serviceId]
  )

  const searchSlots = useCallback(async ({ quiet = false } = {}) => {
    if (!serviceId || !startDate) {
      setSlots([])
      setSelectedSlot(null)
      return
    }
    const sequence = ++searchSequence.current
    if (!quiet) setSlotsLoading(true)
    setError('')
    try {
      const rows = await listarHorariosLivres({
        servicoId: serviceId,
        dataInicial: startDate,
        profissionalId: professionalId || null,
        dias: 14,
        limite: 18,
      })
      if (sequence !== searchSequence.current) return
      setSlots(rows)
      setSelectedSlot((current) => rows.find((item) => (
        item.inicio === current?.inicio && item.profissional_id === current?.profissional_id
      )) ?? null)
    } catch (searchError) {
      if (sequence !== searchSequence.current) return
      setSlots([])
      setSelectedSlot(null)
      setError(mensagemErroEncaixe(searchError).message)
    } finally {
      if (sequence === searchSequence.current) setSlotsLoading(false)
    }
  }, [professionalId, serviceId, startDate])

  useEffect(() => {
    if (!open) return
    let active = true
    setCatalogLoading(true)
    setError('')
    carregarCatalogoEncaixe()
      .then((data) => { if (active) setCatalog(data) })
      .catch((loadError) => { if (active) setError(mensagemErroEncaixe(loadError).message) })
      .finally(() => { if (active) setCatalogLoading(false) })
    return () => { active = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => searchSlots(), 180)
    return () => clearTimeout(timer)
  }, [open, searchSlots])

  useEffect(() => {
    if (open) {
      setStartDate(initialSafeDate)
      return
    }
    searchSequence.current += 1
    setSelectedClient(null)
    setPhone('')
    setServiceId('')
    setProfessionalId('')
    setPrice(null)
    setSlots([])
    setSelectedSlot(null)
    setError('')
  }, [initialSafeDate, open])

  function handleServiceChange(event) {
    const nextId = event.target.value
    const service = catalog.servicos.find((item) => item.id === nextId)
    setServiceId(nextId)
    setPrice(service ? Number(service.preco) : null)
    setSelectedSlot(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!selectedClient) { setError('Selecione ou cadastre o cliente.'); return }
    if (!serviceId) { setError('Selecione o serviço solicitado.'); return }
    if (!selectedSlot) { setError('Escolha um dos próximos horários livres.'); return }

    setSaving(true)
    try {
      let clientId = selectedClient.id
      if (clientId === 'new') {
        const newClient = await criarClienteRapido({ nome: selectedClient.nome, telefone: phone })
        clientId = newClient.id
      }
      const result = await criarEncaixe({
        clienteId: clientId,
        servicoId: serviceId,
        profissionalId: selectedSlot.profissional_id,
        inicio: selectedSlot.inicio,
        valorFinal: price,
      })
      await onSuccess?.(result, selectedSlot)
      onClose()
    } catch (saveError) {
      const friendly = mensagemErroEncaixe(saveError)
      setError(friendly.message)
      if (friendly.occupied) await searchSlots({ quiet: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Encaixe sem horário"
      className="sm:max-w-3xl"
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="walk-in-form" loading={saving} disabled={!selectedSlot}>Confirmar encaixe</Button>
        </>
      )}
    >
      <form id="walk-in-form" className="space-y-5" onSubmit={handleSubmit}>
        <p className="text-body-sm text-steel">Informe o serviço e veja, em tempo real, o próximo espaço disponível de toda a equipe.</p>

        {error && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</p>}

        {catalogLoading ? (
          <div className="flex min-h-40 items-center justify-center gap-3 text-body text-steel"><Spinner size={22} /> Preparando o encaixe</div>
        ) : (
          <>
            <section className="space-y-2">
              <Label>Cliente</Label>
              <ClientSearch clients={catalog.clientes} onSelect={setSelectedClient} />
              {selectedClient && <p className="text-body-sm text-steel">Selecionado: <strong className="text-warm-white">{selectedClient.nome}</strong>{selectedClient.id === 'new' ? ' · novo cadastro' : ''}</p>}
              {selectedClient?.id === 'new' && <Input label="Telefone (opcional)" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(00) 00000-0000" />}
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-label text-steel">
                <span className="mb-2 flex items-center gap-2"><Scissors size={14} /> Serviço</span>
                <select value={serviceId} onChange={handleServiceChange} className={selectClass}>
                  <option value="">Selecione o serviço</option>
                  {catalog.servicos.map((service) => <option key={service.id} value={service.id}>{service.nome} · {service.duracao_minutos} min</option>)}
                </select>
              </label>
              <label className="block text-label text-steel">
                <span className="mb-2 flex items-center gap-2"><UserRound size={14} /> Equipe</span>
                <select value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setSelectedSlot(null) }} className={selectClass}>
                  <option value="">Próximo horário da equipe</option>
                  {catalog.profissionais.map((professional) => <option key={professional.id} value={professional.id}>{nomeProfissional(professional)}</option>)}
                </select>
              </label>
              <Input label="Buscar a partir de" type="date" min={today} value={startDate} onChange={(event) => { setStartDate(event.target.value); setSelectedSlot(null) }} />
              <CurrencyInput label="Valor do atendimento" value={price} onValueChange={setPrice} disabled={!selectedService} helpText={selectedService ? `Valor sugerido para ${selectedService.nome}.` : 'Selecione primeiro o serviço.'} />
            </div>

            <section aria-label="Próximos horários livres">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-h3 text-warm-white">Próximos horários livres</h3>
                  <p className="mt-1 text-body-sm text-steel">A agenda, pausas, bloqueios e atendimentos já marcados são respeitados.</p>
                </div>
                <Button size="sm" variant="ghost" disabled={!serviceId || slotsLoading} onClick={() => searchSlots()} aria-label="Atualizar horários"><RefreshCw size={16} /></Button>
              </div>

              {slotsLoading ? (
                <div className="flex min-h-32 items-center justify-center gap-3 text-body-sm text-steel"><Spinner size={20} /> Consultando a equipe</div>
              ) : !serviceId ? (
                <EmptyState icon={Scissors} className="py-10" title="Selecione o serviço" description="A duração do serviço define quais espaços podem receber o cliente." />
              ) : slots.length === 0 ? (
                <EmptyState icon={CalendarClock} className="py-10" title="Nenhum horário disponível" description="Tente outra data ou confira a jornada da equipe em Disponibilidade." />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {slots.map((slot) => {
                    const selected = selectedSlot?.inicio === slot.inicio && selectedSlot?.profissional_id === slot.profissional_id
                    return (
                      <button
                        type="button"
                        key={`${slot.profissional_id}-${slot.inicio}`}
                        aria-pressed={selected}
                        onClick={() => setSelectedSlot(slot)}
                        className={`min-w-0 rounded-sm border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper ${selected ? 'border-copper bg-copper/10' : 'border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2'}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <strong className="truncate text-body text-warm-white">{nomeProfissional(slot)}</strong>
                          <span className="shrink-0 text-data text-copper"><Clock3 size={14} className="mr-1 inline" />{formatarHora(slot.inicio)}</span>
                        </span>
                        <span className="mt-1 block text-body-sm capitalize text-steel">{formatarDia(slot.inicio)} · até {formatarHora(slot.fim)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </form>
    </Modal>
  )
}
