import { useEffect, useMemo, useState } from 'react'
import { Clock3, History, Scissors } from 'lucide-react'
import Button from './ui/Button'
import CurrencyInput from './ui/CurrencyInput'
import Input from './ui/Input'
import Label from './ui/Label'
import Modal from './ui/Modal'
import Spinner from './ui/Spinner'
import ClientSearch from './ClientSearch'
import ClientDuplicateWarning from './ClientDuplicateWarning'
import { carregarCatalogoEncaixe, criarClienteRapido, criarEncaixeRetroativo, mensagemErroEncaixe } from '../lib/agenda/encaixe-api'

const selectClass = 'h-10 w-full rounded-sm border border-line-strong bg-surface-2 px-3 text-body text-warm-white outline-none transition-colors focus:border-copper focus-visible:ring-2 focus-visible:ring-copper'

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function dateDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return localDateKey(date)
}

function minutesAgo(minutes) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return timeValue(new Date(Math.max(startOfDay.getTime(), now.getTime() - minutes * 60000)))
}

function calculateEndTime(start, durationMinutes = 30) {
  if (!start) return ''
  const [h, m] = start.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = h * 60 + m + Number(durationMinutes)
  const endH = Math.floor(total / 60)
  const endM = total % 60
  if (endH >= 24) return '23:59'
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

export default function RetroactiveWalkInModal({ open, onClose, onSuccess }) {
  const [catalog, setCatalog] = useState({ servicos: [], clientes: [] })
  const [loading, setLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [phone, setPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [price, setPrice] = useState(null)
  const [startDate, setStartDate] = useState(localDateKey())
  const [startTime, setStartTime] = useState(() => minutesAgo(30))
  const [endTime, setEndTime] = useState(() => timeValue())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedService = useMemo(() => catalog.servicos.find((item) => item.id === serviceId), [catalog.servicos, serviceId])

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError('')
    setStartDate(localDateKey())
    const initialStart = minutesAgo(30)
    setStartTime(initialStart)
    setEndTime(timeValue())
    carregarCatalogoEncaixe()
      .then((data) => { if (active) setCatalog(data) })
      .catch((loadError) => { if (active) setError(mensagemErroEncaixe(loadError).message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open])

  useEffect(() => {
    if (open) return
    setSelectedClient(null)
    setPhone('')
    setServiceId('')
    setPrice(null)
    setError('')
  }, [open])

  function selectService(event) {
    const id = event.target.value
    const service = catalog.servicos.find((item) => item.id === id)
    setServiceId(id)
    setPrice(service ? Number(service.preco) : null)
    if (service && startTime) {
      setEndTime(calculateEndTime(startTime, service.duracao_minutos))
    }
  }

  function handleStartTimeChange(value) {
    setStartTime(value)
    if (selectedService && value) {
      setEndTime(calculateEndTime(value, selectedService.duracao_minutos))
    }
  }

  function selectMinutesAgo(minutes) {
    const now = new Date()
    setStartDate(localDateKey(now))
    const startStr = minutesAgo(minutes)
    setStartTime(startStr)
    const duration = selectedService?.duracao_minutos || minutes
    setEndTime(calculateEndTime(startStr, duration))
  }

  function validateTimes(start, end) {
    const today = localDateKey()
    const earliestDate = dateDaysAgo(2)
    if (!startDate || startDate < earliestDate || startDate > today) {
      return 'Informe uma data entre hoje e os dois dias anteriores.'
    }
    if (!startTime || !endTime || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 'Informe horários válidos de início e término.'
    }
    if (end <= start) {
      return 'O horário de término deve ser posterior ao horário de início.'
    }
    if (end > new Date()) {
      return 'O horário de término não pode estar no futuro.'
    }
    return null
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!selectedClient) { setError('Selecione ou cadastre o cliente.'); return }
    if (!serviceId) { setError('Selecione o serviço realizado.'); return }

    const start = new Date(`${startDate}T${startTime}:00`)
    const end = new Date(`${startDate}T${endTime}:00`)
    const validationError = validateTimes(start, end)
    if (validationError) { setError(validationError); return }

    setSaving(true)
    try {
      let clientId = selectedClient.id
      if (clientId === 'new') {
        const newClient = await criarClienteRapido({ nome: selectedClient.nome, telefone: phone })
        clientId = newClient.id
      }
      const appointment = await criarEncaixeRetroativo({
        clienteId: clientId,
        servicoId: serviceId,
        inicio: start.toISOString(),
        fim: end.toISOString(),
        valorFinal: price,
      })
      await onSuccess?.(appointment)
      onClose()
    } catch (saveError) {
      setError(mensagemErroEncaixe(saveError).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Registrar atendimento já iniciado" className="sm:max-w-2xl" footer={<><Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" form="retroactive-walk-in-form" loading={saving}>Registrar atendimento</Button></>}>
      <form id="retroactive-walk-in-form" className="space-y-5" onSubmit={submit}>
        <div className="flex gap-3 rounded-sm border border-warning/30 bg-warning/10 p-3 text-body-sm text-warning"><History size={19} className="mt-0.5 shrink-0" /><p>Use quando o corte começou sem ter sido registrado, hoje ou nos dois dias anteriores. O atendimento ficará marcado permanentemente como retroativo.</p></div>
        {error && <p role="alert" className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-body-sm text-danger">{error}</p>}
        {loading ? <div className="flex min-h-40 items-center justify-center gap-3 text-steel"><Spinner size={22} /> Preparando o registro</div> : <>
          <section className="space-y-2">
            <Label>Cliente</Label>
            <ClientSearch clients={catalog.clientes} onSelect={setSelectedClient} />
            {selectedClient?.id === 'new' && <><Input label="WhatsApp/telefone (recomendado)" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(00) 00000-0000" /><ClientDuplicateWarning clients={catalog.clientes} nome={selectedClient.nome} telefone={phone} onSelect={(client) => { setSelectedClient(client); setPhone('') }} /></>}
          </section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-label text-steel sm:col-span-2"><span className="mb-2 flex items-center gap-2"><Scissors size={14} /> Serviço realizado</span><select value={serviceId} onChange={selectService} className={selectClass}><option value="">Selecione o serviço</option>{catalog.servicos.map((service) => <option key={service.id} value={service.id}>{service.nome} · {service.duracao_minutos} min</option>)}</select></label>
            <Input label="Data em que começou" type="date" min={dateDaysAgo(2)} max={localDateKey()} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <CurrencyInput label="Valor do atendimento" value={price} onValueChange={setPrice} disabled={!selectedService} />
            <Input label="Horário em que começou" type="time" max={startDate === localDateKey() ? timeValue() : undefined} value={startTime} onChange={(event) => handleStartTimeChange(event.target.value)} />
            <Input label="Horário de término" type="time" max={startDate === localDateKey() ? timeValue() : undefined} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            <div className="rounded-sm border border-line bg-surface-1 p-3 sm:col-span-2"><span className="flex items-center gap-2 text-label text-steel"><Clock3 size={14} /> Atalhos para hoje</span><div className="mt-2 flex flex-wrap gap-2">{[15,30,45,60].map((minutes) => <Button key={minutes} type="button" size="sm" variant="secondary" onClick={() => selectMinutesAgo(minutes)}>Há {minutes} min</Button>)}</div></div>
          </div>
        </>}
      </form>
    </Modal>
  )
}
