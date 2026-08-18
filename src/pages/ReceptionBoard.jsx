import React, { useState, useEffect } from 'react';
import { Users, Calendar, TrendingUp, Bell } from 'lucide-react';
import TimeGrid from '../components/TimeGrid';
import AdminAppointmentModal from '../components/AdminAppointmentModal';
import { supabase } from '../lib/supabase'; // Assuming Supabase client is exported from here

const MOCK_PROFESSIONALS = [
    { id: '1', nome: 'Dener' },
    { id: '2', nome: 'Vini' },
    { id: '3', nome: 'Ruan' },
    { id: '4', nome: 'Caio' },
];

const MOCK_APPOINTMENTS = [
    { id: '101', profissional_id: '1', cliente: 'Lucas Silva', horario: '09:00', duracao: 60, servico: 'Corte Degradê', status: 'pending' },
    { id: '102', profissional_id: '2', cliente: 'André Souza', horario: '10:00', duracao: 30, servico: 'Barba', status: 'in_progress' },
    { id: '103', profissional_id: '3', cliente: 'Mateus Lima', horario: '11:00', duracao: 90, servico: 'Corte + Barba', status: 'pending' },
    { id: '104', profissional_id: '1', cliente: 'João Pedro', horario: '14:30', duracao: 30, servico: 'Pézinho', status: 'pending' },
];

const ReceptionBoard = () => {
    const [appointments, setAppointments] = useState(MOCK_APPOINTMENTS);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState({ proId: '', time: '' });

    // Setup Real-time Subscriptions logic
    useEffect(() => {
        // Note: In a real scenario, we would use supabase.channel() here
        // Example:
        /*
        const channel = supabase
          .channel('schema-db-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, (payload) => {
            console.log('Real-time change received:', payload);
            // Refresh appointments or apply delta
          })
          .subscribe();

        return () => supabase.removeChannel(channel);
        */
        console.log('Real-time channel listening for agendamentos changes...');
    }, []);

    const handleSlotClick = (proId, time) => {
        setSelectedSlot({ proId, time });
        setIsModalOpen(true);
    };

    const handleSaveAppointment = (data) => {
        console.log('Saving appointment:', data);
        const newApp = {
            id: Math.random().toString(),
            profissional_id: data.profissionalId || selectedSlot.proId,
            cliente: data.selectedClient?.nome || 'Cliente Novo',
            horario: data.horario,
            duracao: data.servicoId === '2' ? 60 : data.servicoId === '4' ? 90 : 30,
            servico: 'Serviço Novo',
            status: 'pending'
        };
        setAppointments([...appointments, newApp]);
        setIsModalOpen(false);
    };

    return (
        <div className="h-screen w-screen flex flex-col bg-surface-1 text-warm-white overflow-hidden">

            {/* Navbar Admnistrativa - VISÃO RECEPÇÃO (SEM FINANCEIRO) */}
            <nav className="h-20 border-b border-line bg-surface-2 flex items-center justify-between px-8 shrink-0">
                <div className="flex items-center space-x-4">
                    <div className="bg-copper p-2 rounded-sm">
                        <Calendar className="text-surface-0" size={24} />
                    </div>
                    <div>
                        <h1 className="text-h1 text-copper uppercase">Quadro de Recepção</h1>
                        <p className="text-label text-steel leading-none">Visão da Unidade • TV Mode</p>
                    </div>
                </div>

                {/* Info da Unidade (Sem dinheiro) */}
                <div className="hidden md:flex items-center space-x-8">
                    <div className="text-right">
                        <div className="text-label text-steel">Data</div>
                        <div className="text-h2 text-warm-white">{new Date().toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div className="bg-surface-2 p-2 rounded-full text-steel hover:text-copper cursor-pointer relative">
                        <Bell size={20} />
                        <span className="absolute top-1 right-1 w-2 h-2 bg-copper rounded-full border-2 border-surface-2"></span>
                    </div>
                </div>
            </nav>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar slim */}
                <aside className="w-16 border-r border-line bg-surface-2 flex flex-col items-center py-8 space-y-8 shrink-0">
                    <Calendar className="text-copper" />
                </aside>

                {/* TIME GRID CORE */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <TimeGrid
                        professionals={MOCK_PROFESSIONALS}
                        appointments={appointments}
                        onSlotClick={handleSlotClick}
                    />
                </div>
            </div>

            <AdminAppointmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={{ profissionalId: selectedSlot.proId, time: selectedSlot.time }}
                onSave={handleSaveAppointment}
            />
        </div>
    );
};

export default ReceptionBoard;
