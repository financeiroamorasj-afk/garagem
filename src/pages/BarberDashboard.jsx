import React, { useState } from 'react';
import { Play, CheckCircle, Plus, Clock, User, Scissors } from 'lucide-react';
import QuickActionModal from '../components/QuickActionModal';

// Mock data for the barbers daily schedule
const MOCK_APPOINTMENTS = [
    { id: 1, time: '09:00', client: 'Carlos Oliveira', service: 'Corte Social', status: 'pending' },
    { id: 2, time: '10:00', client: 'Ricardo Silva', service: 'Barba + Toalha Quente', status: 'in_progress' },
    { id: 3, time: '11:30', client: 'Lucas Mendes', service: 'Corte Degradê', status: 'pending' },
    { id: 4, time: '14:00', client: 'Mateus Santos', service: 'Corte + Sobrancelha', status: 'pending' },
    { id: 5, time: '15:00', client: 'Fernando Costa', service: 'Corte Social', status: 'pending' },
];

const BarberDashboard = () => {
    const [appointments, setAppointments] = useState(MOCK_APPOINTMENTS);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const updateStatus = (id, newStatus) => {
        setAppointments(prev => prev.map(app =>
            app.id === id ? { ...app, status: newStatus } : app
        ));
    };

    return (
        <div className="min-h-screen bg-industrial-dark text-white pb-24 relative">
            {/* Header */}
            <header className="p-6 pt-12 border-b border-gray-800 bg-[#161616]">
                <h1 className="text-2xl font-black tracking-tighter text-copper uppercase">Agenda de Hoje</h1>
                <p className="text-gray-500 text-sm mt-1">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </header>

            {/* Timeline */}
            <main className="p-4 space-y-4">
                {appointments.map((app) => (
                    <div
                        key={app.id}
                        className={`relative group bg-[#1a1a1a] border-l-4 rounded-xl p-5 shadow-xl transition-all active:scale-[0.99] ${app.status === 'in_progress' ? 'border-copper bg-[#1e1e1e]' : 'border-gray-800'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-3">
                                <div className={`p-2 rounded-lg ${app.status === 'in_progress' ? 'bg-copper text-white' : 'bg-gray-800 text-gray-400'}`}>
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <span className="text-xl font-black text-white">{app.time}</span>
                                    <div className="flex items-center text-gray-500 text-xs mt-0.5 uppercase tracking-widest font-bold">
                                        <User size={12} className="mr-1" /> {app.client}
                                    </div>
                                </div>
                            </div>

                            {app.status === 'pending' ? (
                                <button
                                    onClick={() => updateStatus(app.id, 'in_progress')}
                                    className="bg-gray-800 hover:bg-copper text-white p-3 rounded-xl transition-colors shadow-lg"
                                >
                                    <Play size={20} fill="currentColor" />
                                </button>
                            ) : app.status === 'in_progress' ? (
                                <button
                                    onClick={() => updateStatus(app.id, 'completed')}
                                    className="bg-copper hover:bg-copper-light text-white p-3 rounded-xl transition-colors shadow-lg animate-pulse"
                                >
                                    <CheckCircle size={20} />
                                </button>
                            ) : (
                                <div className="text-copper opacity-50 p-3">
                                    <CheckCircle size={20} fill="currentColor" />
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-800/50 flex items-center justify-between text-gray-400">
                            <div className="flex items-center space-x-2">
                                <Scissors size={14} className="text-copper" />
                                <span className="text-sm font-medium">{app.service}</span>
                            </div>
                            {app.status === 'completed' && <span className="text-xs font-bold uppercase text-copper">Finalizado</span>}
                        </div>
                    </div>
                ))}
            </main>

            {/* Floating Action Button (FAB) */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-8 right-6 w-16 h-16 bg-copper hover:bg-copper-light rounded-full shadow-[0_8px_30px_rgb(184,115,51,0.4)] flex items-center justify-center text-white transition-transform active:scale-90 z-40"
            >
                <Plus size={32} strokeWidth={3} />
            </button>

            {/* Quick Action Modal */}
            <QuickActionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={(data) => {
                    console.log('Dados salvos:', data);
                    setIsModalOpen(false);
                    // Adicionar lógica de inserção real depois
                }}
            />
        </div>
    );
};

export default BarberDashboard;
