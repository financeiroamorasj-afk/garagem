import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import BarberColumn from '../components/BarberColumn'
import AddProfessionalModal from '../components/AddProfessionalModal'
import AddAppointmentModal from '../components/AddAppointmentModal'

export default function Dashboard() {
    const navigate = useNavigate()
    const [professionals, setProfessionals] = useState([])
    const [appointments, setAppointments] = useState([])
    const [loading, setLoading] = useState(true)

    // Modals state
    const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false)
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false)
    const [selectedProfessionalId, setSelectedProfessionalId] = useState(null)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            await Promise.all([fetchProfessionals(), fetchAppointments()])
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const fetchProfessionals = async () => {
        try {
            const { data, error } = await supabase
                .from('profissionais')
                .select('*')
                .order('created_at', { ascending: true })

            if (error) throw error
            setProfessionals(data || [])
        } catch (error) {
            console.error('Error fetching professionals:', error.message)
        }
    }

    const fetchAppointments = async () => {
        try {
            // Simplification: fetching all appointments for now
            // In production, filter by date range (today/week)
            const { data, error } = await supabase
                .from('agendamentos')
                .select('*')
                .order('horario', { ascending: true })

            if (error) throw error
            setAppointments(data || [])
        } catch (error) {
            console.error('Error fetching appointments:', error.message)
        }
    }

    const handleOpenAppointmentModal = (professionalId) => {
        setSelectedProfessionalId(professionalId)
        setIsAppointmentModalOpen(true)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        navigate('/')
    }

    return (
        <div className="flex flex-col h-screen bg-industrial-dark text-copper-light overflow-hidden">
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
                    <div className="w-10 h-10 rounded border-2 border-copper bg-gradient-to-br from-copper to-black flex items-center justify-center shadow-[0_0_10px_rgba(184,115,51,0.3)]">
                        <span className="font-bold text-black text-xl">G</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-copper to-gold-aged">
                        Garagem
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    {professionals.length > 0 && (
                        <button
                            onClick={() => setIsProfessionalModalOpen(true)}
                            className="px-4 py-2 text-xs font-bold bg-copper/10 text-copper border border-copper/50 rounded hover:bg-copper hover:text-industrial-dark transition-all duration-300 uppercase tracking-widest"
                        >
                            + Add Profissional
                        </button>
                    )}
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 text-xs font-bold text-red-400/80 hover:text-red-400 border border-transparent hover:border-red-900/30 hover:bg-red-900/10 transition-all duration-300 rounded uppercase tracking-widest"
                    >
                        Sair
                    </button>
                </div>
            </header>

            {/* Main Kanban Area */}
            <main className="flex-1 overflow-x-auto overflow-y-hidden bg-[#121212] relative">
                {/* Background Texture/Gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent pointer-events-none"></div>

                {loading && professionals.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-copper"></div>
                    </div>
                ) : professionals.length === 0 ? (
                    /* Empty State */
                    <div className="flex flex-col items-center justify-center h-full space-y-6 animate-fade-in">
                        <div className="w-20 h-20 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                            <span className="text-4xl text-white/20">+</span>
                        </div>
                        <p className="text-xl text-white/30 uppercase tracking-widest">Nenhum barbeiro encontrado</p>
                        <button
                            onClick={() => setIsProfessionalModalOpen(true)}
                            className="px-8 py-3 text-sm font-bold bg-copper text-industrial-dark rounded hover:bg-copper-light shadow-[0_0_20px_rgba(184,115,51,0.4)] transition-all duration-300 uppercase tracking-widest hover:scale-105"
                        >
                            + Adicionar Primeiro Barbeiro
                        </button>
                    </div>
                ) : (
                    /* Kanban Columns */
                    <div className="flex h-full divide-x divide-white/5">
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
                            className="flex-shrink-0 w-20 bg-black/20 hover:bg-black/40 transition-colors border-l border-white/5 flex items-center justify-center cursor-pointer group"
                        >
                            <div className="w-10 h-10 rounded-full border border-white/10 group-hover:border-copper/50 flex items-center justify-center transition-all">
                                <span className="text-white/20 group-hover:text-copper text-2xl">+</span>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
