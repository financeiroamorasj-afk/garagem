
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import Label from './ui/Label'
import CurrencyInput from './ui/CurrencyInput'
import ClientSearch from './ClientSearch'

function todayDateString() {
    return new Date().toISOString().split('T')[0]
}

export default function AddAppointmentModal({ isOpen, onClose, onSuccess, professionalId }) {
    const [barbeariaId, setBarbeariaId] = useState(null)
    const [servicos, setServicos] = useState([])
    const [clientes, setClientes] = useState([])
    const [loadingOptions, setLoadingOptions] = useState(false)

    const [selectedClient, setSelectedClient] = useState(null)
    const [servicoId, setServicoId] = useState('')
    const [valorFinal, setValorFinal] = useState(null)
    const [date, setDate] = useState(todayDateString())
    const [time, setTime] = useState('')

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Carrega barbearia_id + serviços/clientes da barbearia ao abrir o modal.
    useEffect(() => {
        if (!isOpen) return

        const loadOptions = async () => {
            setLoadingOptions(true)
            setError(null)
            try {
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

                const [servicosRes, clientesRes] = await Promise.all([
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
                ])

                if (servicosRes.error) throw servicosRes.error
                if (clientesRes.error) throw clientesRes.error

                setServicos(servicosRes.data || [])
                setClientes(clientesRes.data || [])
            } catch (err) {
                console.error(err)
                setError(err.message)
            } finally {
                setLoadingOptions(false)
            }
        }

        loadOptions()
    }, [isOpen])

    // Reset ao fechar, pra não vazar estado de uma abertura pra outra.
    useEffect(() => {
        if (!isOpen) {
            setSelectedClient(null)
            setServicoId('')
            setValorFinal(0)
            setDate(todayDateString())
            setTime('')
            setError(null)
        }
    }, [isOpen])

    const handleServicoChange = (e) => {
        const id = e.target.value
        setServicoId(id)
        const servico = servicos.find((s) => s.id === id)
        // Preenche o valor sugerido, mas o campo continua editável (desconto pontual etc.)
        if (servico) setValorFinal(Number(servico.preco))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)

        if (!professionalId) { setError('Profissional não selecionado'); return }
        if (!selectedClient) { setError('Selecione ou cadastre um cliente'); return }
        if (!servicoId) { setError('Selecione um serviço'); return }
        if (!date || !time) { setError('Informe data e horário'); return }

        setLoading(true)
        try {
            const dataHora = new Date(`${date}T${time}:00`)
            if (Number.isNaN(dataHora.getTime())) throw new Error('Data ou horário inválido')

            // Cliente sem match no ClientSearch (sentinel 'new') vira um cadastro
            // de verdade em `clientes` antes do agendamento — não é mais gravado
            // só como texto livre.
            let clienteId = selectedClient.id
            if (clienteId === 'new') {
                const { data: novoCliente, error: clienteError } = await supabase
                    .from('clientes')
                    .insert([{ barbearia_id: barbeariaId, nome: selectedClient.nome }])
                    .select('id')
                    .single()

                if (clienteError) throw new Error(`Erro ao cadastrar cliente: ${clienteError.message}`)
                clienteId = novoCliente.id
            }

            const { error: insertError } = await supabase
                .from('agendamentos')
                .insert([
                    {
                        barbearia_id: barbeariaId,
                        profissional_id: professionalId,
                        servico_id: servicoId,
                        cliente_id: clienteId,
                        data_hora: dataHora.toISOString(),
                        valor_final: valorFinal,
                        status: 'pendente',
                    },
                ])

            if (insertError) throw insertError

            onSuccess()
            onClose()
        } catch (err) {
            console.error(err)
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Novo Agendamento"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={loading}>
                        Agendar
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && <p className="text-body-sm text-danger">{error}</p>}

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
                </section>

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Data"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                    <Input
                        label="Horário"
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                    />
                </div>

                <section className="space-y-2">
                    <CurrencyInput label="Valor" value={valorFinal} onValueChange={setValorFinal} />
                </section>
            </form>
        </Modal>
    )
}
