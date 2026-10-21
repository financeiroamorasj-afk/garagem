
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import Label from './ui/Label'
import CurrencyInput from './ui/CurrencyInput'
import ClientSearch from './ClientSearch'
import { dataLocalKey, mensagemErroAgenda } from '../lib/agenda/ui'
import {
    carregarCatalogoEncaixe,
    criarAgendamentoBarbeiro,
    criarClienteRapido,
    listarHorariosLivres,
} from '../lib/agenda/encaixe-api'

function todayDateString() {
    return dataLocalKey()
}

function formatarHorario(value) {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export default function AddAppointmentModal({ isOpen, onClose, onSuccess, professionalId = null, initialDate = null, mode = 'admin' }) {
    const isBarberFlow = mode === 'barber'
    const slotRequest = useRef(0)
    const [barbeariaId, setBarbeariaId] = useState(null)
    const [servicos, setServicos] = useState([])
    const [clientes, setClientes] = useState([])
    const [profissionais, setProfissionais] = useState([])
    const [loadingOptions, setLoadingOptions] = useState(false)

    const [selectedClient, setSelectedClient] = useState(null)
    const [servicoId, setServicoId] = useState('')
    const [valorFinal, setValorFinal] = useState(null)
    const [date, setDate] = useState(todayDateString())
    const [selectedProfessionalId, setSelectedProfessionalId] = useState(professionalId || '')
    const [slots, setSlots] = useState([])
    const [selectedSlot, setSelectedSlot] = useState(null)
    const [slotsLoading, setSlotsLoading] = useState(false)
    const [slotsRevision, setSlotsRevision] = useState(0)

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Carrega barbearia_id + serviços/clientes da barbearia ao abrir o modal.
    useEffect(() => {
        if (!isOpen) return

        const loadOptions = async () => {
            setLoadingOptions(true)
            setError(null)
            try {
                if (isBarberFlow) {
                    const catalog = await carregarCatalogoEncaixe()
                    setServicos(catalog.servicos)
                    setClientes(catalog.clientes)
                    setProfissionais(catalog.profissionais)
                    setSelectedProfessionalId(professionalId || '')
                    return
                }

                const { data: { session }, error: sessionError } = await supabase.auth.getSession()
                if (sessionError) throw sessionError
                if (!session) throw new Error('Não autenticado')

                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('barbearia_id')
                    .eq('id', session.user.id)
                    .single()

                if (profileError || !profile?.barbearia_id) throw new Error('Erro ao identificar barbearia')
                setBarbeariaId(profile.barbearia_id)

                const [servicosRes, clientesRes, profissionaisRes] = await Promise.all([
                    supabase
                        .from('servicos')
                        .select('id, nome, preco, duracao_minutos')
                        .eq('barbearia_id', profile.barbearia_id)
                        .eq('ativo', true)
                        .order('nome', { ascending: true }),
                    supabase
                        .from('clientes')
                        .select('id, nome, telefone')
                        .eq('barbearia_id', profile.barbearia_id)
                        .order('nome', { ascending: true }),
                    supabase
                        .from('profissionais')
                        .select('id, nome, apelido')
                        .eq('barbearia_id', profile.barbearia_id)
                        .eq('ativo', true)
                        .order('nome', { ascending: true }),
                ])

                if (servicosRes.error) throw servicosRes.error
                if (clientesRes.error) throw clientesRes.error
                if (profissionaisRes.error) throw profissionaisRes.error

                setServicos(servicosRes.data || [])
                setClientes(clientesRes.data || [])
                setProfissionais(profissionaisRes.data || [])
                if (!professionalId && profissionaisRes.data?.length) {
                    setSelectedProfessionalId(profissionaisRes.data[0].id)
                }
            } catch (err) {
                console.error(err)
                setError(err.message)
            } finally {
                setLoadingOptions(false)
            }
        }

        loadOptions()
    }, [isBarberFlow, isOpen, professionalId])

    // Reset ao fechar, pra não vazar estado de uma abertura pra outra.
    useEffect(() => {
        if (!isOpen) {
            setSelectedClient(null)
            setServicoId('')
            setValorFinal(null)
            setDate(initialDate || todayDateString())
            setSelectedProfessionalId(professionalId || '')
            setSlots([])
            setSelectedSlot(null)
            setError(null)
        }
    }, [initialDate, isOpen, professionalId])

    useEffect(() => {
        if (!isOpen || !servicoId || !selectedProfessionalId || !date) {
            setSlots([])
            setSelectedSlot(null)
            return
        }

        const request = ++slotRequest.current
        setError(null)
        setSlotsLoading(true)
        listarHorariosLivres({
            servicoId,
            dataInicial: date,
            profissionalId: selectedProfessionalId,
            dias: 1,
            limite: 50,
        })
            .then((rows) => {
                if (request !== slotRequest.current) return
                setSlots(rows)
                setSelectedSlot((current) => rows.find((slot) => slot.inicio === current?.inicio) ?? null)
            })
            .catch((slotError) => {
                if (request !== slotRequest.current) return
                setSlots([])
                setSelectedSlot(null)
                setError(mensagemErroAgenda(slotError))
            })
            .finally(() => {
                if (request === slotRequest.current) setSlotsLoading(false)
            })

        return () => { slotRequest.current += 1 }
    }, [date, isOpen, selectedProfessionalId, servicoId, slotsRevision])

    const handleServicoChange = (e) => {
        const id = e.target.value
        setServicoId(id)
        const servico = servicos.find((s) => s.id === id)
        setSelectedSlot(null)
        // Preenche o valor sugerido, mas o campo continua editável (desconto pontual etc.)
        if (servico) setValorFinal(Number(servico.preco))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)

        if (!selectedProfessionalId) { setError('Profissional não selecionado'); return }
        if (!selectedClient) { setError('Selecione ou cadastre um cliente'); return }
        if (!servicoId) { setError('Selecione um serviço'); return }
        if (!date || !selectedSlot) { setError('Escolha um dos horários disponíveis'); return }

        setLoading(true)
        try {
            const dataHora = new Date(selectedSlot.inicio)
            if (Number.isNaN(dataHora.getTime())) throw new Error('Data ou horário inválido')

            // Cliente sem match no ClientSearch (sentinel 'new') vira um cadastro
            // de verdade em `clientes` antes do agendamento — não é mais gravado
            // só como texto livre.
            let clienteId = selectedClient.id
            if (clienteId === 'new') {
                if (isBarberFlow) {
                    const novoCliente = await criarClienteRapido({ nome: selectedClient.nome })
                    clienteId = novoCliente.id
                } else {
                    const { data: novoCliente, error: clienteError } = await supabase
                        .from('clientes')
                        .insert([{ barbearia_id: barbeariaId, nome: selectedClient.nome }])
                        .select('id')
                        .single()

                    if (clienteError) throw new Error(`Erro ao cadastrar cliente: ${clienteError.message}`)
                    clienteId = novoCliente.id
                }
            }

            let result
            if (isBarberFlow) {
                result = await criarAgendamentoBarbeiro({
                    clienteId,
                    servicoId,
                    inicio: dataHora.toISOString(),
                    valorFinal,
                })
            } else {
                const { data: created, error: insertError } = await supabase
                    .from('agendamentos')
                    .insert([
                        {
                            barbearia_id: barbeariaId,
                            profissional_id: selectedProfessionalId,
                            servico_id: servicoId,
                            cliente_id: clienteId,
                            data_hora: dataHora.toISOString(),
                            valor_final: valorFinal,
                            status: 'pendente',
                        },
                    ])
                    .select('id, status, profissional_id, data_hora')
                    .single()

                if (insertError) throw insertError
                result = { ...created, inicio: created.data_hora }
            }

            await onSuccess?.(result, selectedSlot)
            onClose()
        } catch (err) {
            console.error(err)
            setError(mensagemErroAgenda(err))
            setSlotsRevision((current) => current + 1)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={isBarberFlow ? 'Novo corte' : 'Novo Agendamento'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        {isBarberFlow ? 'Confirmar corte' : 'Agendar'}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-body-sm text-danger">{error}</p>}

                {isBarberFlow && (
                    <p className="rounded-sm border border-info/30 bg-info/10 p-3 text-body-sm text-info">
                        Escolha um horário livre da sua agenda. O corte será confirmado na hora.
                    </p>
                )}

                <section className="space-y-2">
                    <Label>Cliente</Label>
                    <ClientSearch clients={clientes} onSelect={setSelectedClient} />
                    {selectedClient && (
                        <p className="text-body-sm text-steel">
                            Selecionado: {selectedClient.nome}
                            {selectedClient.id === 'new' && ' (novo — será cadastrado ao salvar o agendamento)'}
                        </p>
                    )}
                </section>

                {!professionalId && (
                    <section className="space-y-2">
                        <Label>Barbeiro</Label>
                        <select
                            value={selectedProfessionalId}
                            onChange={(event) => { setSelectedProfessionalId(event.target.value); setSelectedSlot(null) }}
                            disabled={loadingOptions}
                            className="w-full appearance-none rounded-sm border border-line-strong bg-surface-2 px-4 py-3 text-warm-white outline-none transition-colors duration-100 ease-brand focus:border-copper"
                        >
                            <option value="">Selecione um barbeiro...</option>
                            {profissionais.map((profissional) => (
                                <option key={profissional.id} value={profissional.id}>
                                    {profissional.apelido || profissional.nome}
                                </option>
                            ))}
                        </select>
                    </section>
                )}

                <section className="space-y-2">
                    <Label>Serviço</Label>
                    <select
                        value={servicoId}
                        onChange={handleServicoChange}
                        disabled={loadingOptions}
                        className="w-full bg-surface-2 border border-line-strong rounded-sm px-4 py-3 text-warm-white focus:border-copper outline-none appearance-none transition-colors duration-100 ease-brand"
                    >
                        <option value="">
                            {loadingOptions ? 'Carregando...' : 'Selecione um serviço...'}
                        </option>
                        {servicos.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.nome} {s.duracao_minutos ? `(${s.duracao_minutos} min)` : ''}
                            </option>
                        ))}
                    </select>
                    {!loadingOptions && servicos.length === 0 && (
                        <p className="text-body-sm text-steel">
                            Nenhum serviço cadastrado ainda para esta barbearia.
                        </p>
                    )}
                    {servicoId && (
                        <p className="text-body-sm text-steel">
                            A agenda reserva a duração do serviço mais o intervalo definido pela gestão.
                        </p>
                    )}
                </section>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input
                        label="Data"
                        type="date"
                        value={date}
                        min={todayDateString()}
                        onChange={(e) => { setDate(e.target.value); setSelectedSlot(null) }}
                    />
                    <label className="block text-label text-steel">
                        <span className="mb-2 block">Horário disponível</span>
                        <select
                            value={selectedSlot?.inicio || ''}
                            onChange={(event) => setSelectedSlot(slots.find((slot) => slot.inicio === event.target.value) ?? null)}
                            disabled={!servicoId || !selectedProfessionalId || !date || slotsLoading}
                            className="h-12 w-full appearance-none rounded-sm border border-line-strong bg-surface-2 px-4 text-warm-white outline-none transition-colors duration-100 ease-brand focus:border-copper"
                        >
                            <option value="">
                                {slotsLoading ? 'Consultando disponibilidade...' : slots.length ? 'Selecione um horário...' : 'Nenhum horário disponível'}
                            </option>
                            {slots.map((slot) => <option key={slot.inicio} value={slot.inicio}>{formatarHorario(slot.inicio)}</option>)}
                        </select>
                    </label>
                </div>

                {servicoId && selectedProfessionalId && date && !slotsLoading && slots.length === 0 && (
                    <p className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-body-sm text-warning">
                        Não há espaço livre nessa data. Jornada, intervalo, bloqueios e atendimentos existentes foram considerados.
                    </p>
                )}

                <section className="space-y-2">
                    <CurrencyInput label="Valor" value={valorFinal} onValueChange={setValorFinal} />
                </section>
            </form>
        </Modal>
    )
}
