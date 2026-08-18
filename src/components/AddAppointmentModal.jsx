
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'

export default function AddAppointmentModal({ isOpen, onClose, onSuccess, professionalId }) {
    const [clientName, setClientName] = useState('')
    const [service, setService] = useState('')
    const [time, setTime] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            if (!professionalId) throw new Error('Profissional não selecionado')

            // 1. Get current user session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) throw sessionError
            if (!session) throw new Error('Não autenticado')

            // 2. Get profile for barbearia_id
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('barbearia_id')
                .eq('id', session.user.id)
                .single()

            if (profileError || !profile?.barbearia_id) throw new Error('Erro ao identificar barbearia')

            // 3. Insert appointment
            const { error: insertError } = await supabase
                .from('agendamentos')
                .insert([
                    {
                        cliente_nome: clientName,
                        servico: service,
                        horario: time,
                        profissional_id: professionalId,
                        barbearia_id: profile.barbearia_id,
                        data: new Date().toISOString().split('T')[0] // Default to today for now
                    }
                ])

            if (insertError) throw insertError

            // Success
            setClientName('')
            setService('')
            setTime('')
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
        <Modal open={isOpen} onClose={onClose} title="Novo Agendamento">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 text-body-sm text-danger bg-danger/12 border border-danger/40 rounded-sm">
                        {error}
                    </div>
                )}

                <Input
                    label="Nome do Cliente"
                    type="text"
                    required
                    placeholder="Ex: Carlos Oliveira"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                />

                <Input
                    label="Serviço"
                    type="text"
                    required
                    placeholder="Ex: Barba e Cabelo"
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                />

                <Input
                    label="Horário"
                    type="time"
                    required
                    className="[color-scheme:dark]"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                />

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Agendar' : 'Agendar'}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
