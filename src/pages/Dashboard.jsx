import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import BarberColumn from '../components/BarberColumn'
import AddProfessionalModal from '../components/AddProfessionalModal'
import AddAppointmentModal from '../components/AddAppointmentModal'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

export default function Dashboard() {
    const navigate = useNavigate()
    const [professionals, setProfessionals] = useState([])
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)

    // Modals state
    const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false)
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false)
    const [selectedProfessionalId, setSelectedProfessionalId] = useState(null)

    const fetchProfessionals = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profissionais')
                .select('*')
                .order('criado_em', { ascending: true })

            if (error) throw error
            setProfessionals(data || [])
        } catch (error) {
            console.error('Error fetching professionals:', error.message)
        }
    }, [])

    const fetchAppointments = useCallback(async () => {
        try {
            // Simplification: fetching all appointments for now
            // In production, filter by date range (today/week)
            // Embeds cliente/servico: a tabela guarda só as FKs (cliente_id,
            // servico_id), então os nomes exibidos no card vêm do join.
            const { data, error } = await supabase
                .from('agendamentos')
                .select('*, clientes(nome), servicos(nome)')
                .order('data_hora', { ascending: true })

            if (error) throw error
            setAppointments(data || [])
        } catch (error) {
            console.error('Error fetching appointments:', error.message)
        }
    }, [])

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            await Promise.all([fetchProfessionals(), fetchAppointments()])
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [fetchAppointments, fetchProfessionals])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    const handleOpenAppointmentModal = (professionalId) => {
        setSelectedProfessionalId(professionalId)
        setIsAppointmentModalOpen(true)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/')
    }

    return (
        <div className="flex flex-col h-screen bg-surface-0 overflow-hidden">
            {/* Modals */}
            <AddProfessionalModal
                isOpen={isProfessionalModalOpen}
                onClose={() => setIsProfessionalModalOpen(false)}
                onSuccess={fetchProfessionals}
            />

            <AddAppointmentModal
                isOpen={isAppointmentModalOpen}
                onClose={() => setIsAppointmentModalOpen(false)}
                onSuccess={fetchAppointments}
                professionalId={selectedProfessionalId}
            />

            {/* Top Bar */}
            <header className="flex items-center justify-between px-6 py-4 bg-black/40 border-b border-copper/30 backdrop-blur-md z-20 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-sm border-2 border-copper bg-gradient-to-br from-copper to-black flex items-center justify-center shadow-[0_0_10px_rgba(184,115,51,0.3)]">
                        <span className="font-bold text-black text-xl">G</span>
                    </div>
                    <h1 className="text-h1 text-transparent bg-clip-text bg-gradient-to-r from-copper to-gold-aged uppercase">
                        Garagem
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    {professionals.length > 0 && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsProfessionalModalOpen(true)}
                        >
                            + Add Profissional
                        </Button>
                    )}
                    <Button variant="danger" size="sm" onClick={handleLogout}>
                        Sair
                    </Button>
                </div>
            </header>

            {/* Main Kanban Area */}
            <main className="flex-1 overflow-x-auto overflow-y-hidden bg-surface-1 relative">
                {/* Background Texture/Gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent pointer-events-none"></div>

                {loading && professionals.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <Spinner size={24} />
                    </div>
                ) : professionals.length === 0 ? (
                    /* Empty State */
                    <EmptyState
                        icon={Users}
                        title="Nenhum barbeiro encontrado"
                        action={
                            <Button
                                size="lg"
                                className="shadow-[0_0_20px_rgba(184,115,51,0.4)]"
                                onClick={() => setIsProfessionalModalOpen(true)}
                            >
                                + Adicionar Primeiro Barbeiro
                            </Button>
                        }
                    />
                ) : (
                    /* Kanban Columns */
                    <div className="flex h-full divide-x divide-line">
                        {professionals.map(pro => (
                            <BarberColumn
                                key={pro.id}
                                professional={pro}
                                appointments={appointments.filter(app => app.profissional_id === pro.id)}
                                onAddAppointment={handleOpenAppointmentModal}
                            />
                        ))}

                        {/* Add Column Placeholder (Optional visual cue) */}
                        <div
                            onClick={() => setIsProfessionalModalOpen(true)}
                            className="flex-shrink-0 w-20 bg-black/20 hover:bg-black/40 transition-colors border-l border-line flex items-center justify-center cursor-pointer group"
                        >
                            <div className="w-10 h-10 rounded-full border border-line group-hover:border-copper/50 flex items-center justify-center transition-all">
                                <span className="text-steel group-hover:text-copper text-2xl">+</span>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
