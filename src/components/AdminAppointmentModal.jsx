import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Check } from 'lucide-react';
import ClientSearch from './ClientSearch';
import CurrencyInput from './CurrencyInput';

/**
 * AdminAppointmentModal - Follows 'Rebip' pattern for Admin Reception
 */
const AdminAppointmentModal = ({ isOpen, onClose, onSave, initialData = {} }) => {
    const [selectedClient, setSelectedClient] = useState(null);
    const [profissionalId, setProfissionalId] = useState(initialData.profissionalId || '');
    const [servicoId, setServicoId] = useState('');
    const [horario, setHorario] = useState(initialData.time || '09:00');
    const [value, setValue] = useState(0);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="w-full max-w-xl bg-[#161616] rounded-[2rem] border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-800/50">
                    <h2 className="text-xl font-black text-copper uppercase tracking-tighter">Novo Agendamento</h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    {/* Client Search - Rebip Pattern */}
                    <section className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Cliente</label>
                        <ClientSearch onSelect={setSelectedClient} clients={[]} />
                    </section>

                    <div className="grid grid-cols-2 gap-4">
                        <section className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Horário</label>
                            <input
                                type="time"
                                value={horario}
                                onChange={(e) => setHorario(e.target.value)}
                                className="w-full bg-industrial-dark border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-copper outline-none transition-all"
                            />
                        </section>

                        <section className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Valor do Serviço</label>
                            <CurrencyInput
                                value={value}
                                onChange={setValue}
                            />
                        </section>
                    </div>

                    <section className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Serviço</label>
                        <select
                            value={servicoId}
                            onChange={(e) => setServicoId(e.target.value)}
                            className="w-full bg-industrial-dark border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-copper outline-none appearance-none transition-all"
                        >
                            <option value="">Selecione um serviço...</option>
                            <option value="1">Corte Social (30 min)</option>
                            <option value="2">Degradê (60 min)</option>
                            <option value="3">Barba Completa (30 min)</option>
                            <option value="4">Combo: Corte + Barba (90 min)</option>
                        </select>
                    </section>

                    {/* Action Button */}
                    <button
                        onClick={() => onSave({ selectedClient, profissionalId, servicoId, horario, value })}
                        className="w-full bg-copper hover:bg-copper-light text-white font-black py-5 rounded-2xl shadow-[0_8px_30px_rgba(184,115,51,0.3)] transition-all active:scale-[0.98] flex items-center justify-center space-x-2 text-lg mt-4"
                    >
                        <Check size={24} strokeWidth={3} />
                        <span>AGENDAR AGORA</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminAppointmentModal;
