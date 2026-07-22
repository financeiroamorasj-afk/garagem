
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './Modal'

export default function AddProfessionalModal({ isOpen, onClose, onSuccess }) {
    const [name, setName] = useState('')
    const [specialty, setSpecialty] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // 1. Get current user
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()
            if (sessionError) throw sessionError
            if (!session) throw new Error('Não autenticado')

            // 2. Get profile to find barbearia_id
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('barbearia_id')
                .eq('id', session.user.id)
                .single()

            if (profileError) throw new Error('Erro ao buscar perfil da barbearia: ' + profileError.message)
            if (!profile?.barbearia_id) throw new Error('Usuário não vinculado a uma barbearia')

            // 3. Insert new professional
            const { error: insertError } = await supabase
                .from('profissionais')
                .insert([
                    {
                        nome: name,
                        especialidade: specialty,
                        barbearia_id: profile.barbearia_id
                    }
                ])

            if (insertError) throw insertError

            // Success
            setName('')
            setSpecialty('')
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
        <Modal isOpen={isOpen} onClose={onClose} title="Novo Profissional">
            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-3 text-sm text-red-500 bg-red-900/20 border border-red-900/50 rounded">
                        {error}
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-copper mb-2">
                        Nome do Barbeiro
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper text-white placeholder-white/20 transition-all"
                        placeholder="Ex: João Silva"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium uppercase tracking-widest text-copper mb-2">
                        Especialidade
                    </label>
                    <input
                        type="text"
                        required
                        className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper text-white placeholder-white/20 transition-all"
                        placeholder="Ex: Corte Clássico, Barba"
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
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
                        {loading ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
