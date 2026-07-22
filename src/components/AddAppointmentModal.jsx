
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

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
        <Modal isOpen={isOpen} onClose={onClose} title="Novo Agendamento">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 text-sm text-red-500 bg-red-900/20 border border-red-900/50 rounded">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-copper mb-1">
                        Nome do Cliente
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper text-white placeholder-white/20 transition-all"
                        placeholder="Ex: Carlos Oliveira"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-copper mb-1">
                        Serviço
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper text-white placeholder-white/20 transition-all"
                        placeholder="Ex: Barba e Cabelo"
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-copper mb-1">
                        Horário
                    </label>
                    <input
                        type="time"
                        required
                        className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper text-white placeholder-white/20 transition-all [color-scheme:dark]"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-white/60 hover:text-white transition-colors uppercase tracking-wider"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 text-sm font-bold bg-copper text-industrial-dark rounded hover:bg-copper-light shadow-[0_0_15px_rgba(184,115,51,0.2)] transition-all duration-300 uppercase tracking-wider disabled:opacity-50"
                    >
                        {loading ? 'Agendar' : 'Agendar'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
