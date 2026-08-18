
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'

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
        <Modal open={isOpen} onClose={onClose} title="Novo Profissional">
            <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                    <div className="p-3 text-body-sm text-danger bg-danger/12 border border-danger/40 rounded-sm">
                        {error}
                    </div>
                )}

                <Input
                    label="Nome do Barbeiro"
                    type="text"
                    required
                    placeholder="Ex: João Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <Input
                    label="Especialidade"
                    type="text"
                    required
                    placeholder="Ex: Corte Clássico, Barba"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                />

                <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
