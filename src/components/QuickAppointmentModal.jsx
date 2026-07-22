import React, { useState, useEffect } from 'react';
import {
    X,
    Check,
    Scissors,
    Calendar,
    Clock,
    User,
    Package,
    AlertTriangle,
    ChevronRight,
    Plus,
    Minus
} from 'lucide-react';
import ClientSearch from './ClientSearch';

const QuickAppointmentModal = ({
    isOpen,
    onClose,
    onSave,
    professionals = [],
    services = [],
    products = [],
    clients = [],
    appointments = []
}) => {
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedServices, setSelectedServices] = useState([]);
    const [selectedBarber, setSelectedBarber] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('10:00');
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [conflict, setConflict] = useState(null);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedClient(null);
            setSelectedServices([]);
            setSelectedBarber(professionals[0]?.id || '');
            setDate(new Date().toISOString().split('T')[0]);
            setTime('10:00');
            setSelectedProducts([]);
            setConflict(null);
        }
    }, [isOpen, professionals]);

    // Conflict Detection Logic
    useEffect(() => {
        if (selectedBarber && date && time && selectedServices.length > 0) {
            const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration || 30), 0);
            const startMinutes = timeToMinutes(time);
            const endMinutes = startMinutes + totalDuration;

            const overlapping = appointments.find(app => {
                if (app.barberId !== selectedBarber || app.date !== date) return false;

                const appStart = timeToMinutes(app.time);
                const appEnd = appStart + app.duration;

                return (startMinutes < appEnd && endMinutes > appStart);
            });

            if (overlapping) {
                // Suggest another barber
                const suggestedBarber = professionals.find(p => {
                    if (p.id === selectedBarber) return false;
                    const otherOverlapping = appointments.find(app => {
                        if (app.barberId !== p.id || app.date !== date) return false;
                        const appStart = timeToMinutes(app.time);
                        const appEnd = appStart + app.duration;
                        return (startMinutes < appEnd && endMinutes > appStart);
                    });
                    return !otherOverlapping;
                });

                setConflict({
                    message: `O barbeiro já possui um agendamento neste horário.`,
                    suggestion: suggestedBarber ? suggestedBarber : null
                });
            } else {
                setConflict(null);
            }
        } else {
            setConflict(null);
        }
    }, [selectedBarber, date, time, selectedServices, appointments, professionals]);

    const timeToMinutes = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const toggleService = (service) => {
        if (selectedServices.find(s => s.id === service.id)) {
            setSelectedServices(selectedServices.filter(s => s.id !== service.id));
        } else {
            setSelectedServices([...selectedServices, service]);
        }
    };

    const toggleProduct = (product) => {
        if (selectedProducts.find(p => p.id === product.id)) {
            setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
        } else {
            setSelectedProducts([...selectedProducts, { ...product, quantity: 1 }]);
        }
    };

    const handleSave = () => {
        if (!selectedClient || selectedServices.length === 0 || !selectedBarber) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration || 30), 0);
        const totalValue = selectedServices.reduce((acc, s) => acc + s.value, 0) +
            selectedProducts.reduce((acc, p) => acc + (p.value * p.quantity), 0);

        onSave({
            clientId: selectedClient.id,
            clientName: selectedClient.nome,
            barberId: selectedBarber,
            services: selectedServices,
            products: selectedProducts,
            date,
            time,
            duration: totalDuration,
            totalValue
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
            <div className="w-full max-w-4xl bg-[#161616] rounded-[3rem] border border-gray-800 shadow-2xl flex flex-col my-8">

                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-gray-800/50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-copper/10 p-3 rounded-2xl text-copper">
                            <Scissors size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">NOVO CORTE</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none">Agendamento & Venda</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <X size={32} />
                    </button>
                </div>

                <div className="flex flex-col lg:flex-row flex-1 min-h-0">
                    {/* Left Column: Form */}
                    <div className="flex-1 p-10 space-y-8 border-r border-gray-800/30 overflow-y-auto">

                        {/* Client Search */}
                        <section className="space-y-3">
                            <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Cliente</label>
                            <ClientSearch
                                clients={clients}
                                onSelect={setSelectedClient}
                            />
                            {selectedClient && (
                                <div className="mt-2 flex items-center space-x-2 bg-copper/10 text-copper px-4 py-2 rounded-full w-fit">
                                    <User size={14} />
                                    <span className="text-xs font-black uppercase italic">{selectedClient.nome}</span>
                                </div>
                            )}
                        </section>

                        {/* Service Multi-Select */}
                        <section className="space-y-4">
                            <div className="flex justify-between items-end ml-2">
                                <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">Serviços</label>
                                <span className="text-[10px] text-copper font-black uppercase italic">
                                    Total: {selectedServices.reduce((acc, s) => acc + (s.duration || 30), 0)} min
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {services.map(service => (
                                    <button
                                        key={service.id}
                                        onClick={() => toggleService(service)}
                                        className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden group ${selectedServices.find(s => s.id === service.id)
                                                ? 'bg-copper text-white border-copper shadow-lg'
                                                : 'bg-industrial-dark border-gray-800 text-gray-400 hover:border-gray-500'
                                            }`}
                                    >
                                        <div className="font-black uppercase text-[11px] tracking-tight truncate pr-10">{service.name}</div>
                                        <div className="text-[9px] opacity-60 font-bold mt-1 uppercase">{service.duration} min • R$ {service.value}</div>
                                        {selectedServices.find(s => s.id === service.id) && (
                                            <Check className="absolute top-4 right-4" size={16} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Professional & Time */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <section className="space-y-3">
                                <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Profissional</label>
                                <select
                                    value={selectedBarber}
                                    onChange={(e) => setSelectedBarber(e.target.value)}
                                    className="w-full bg-industrial-dark border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-copper outline-none appearance-none font-bold text-sm"
                                >
                                    {professionals.map(pro => (
                                        <option key={pro.id} value={pro.id}>{pro.apelido}</option>
                                    ))}
                                </select>
                            </section>
                            <section className="space-y-3">
                                <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Horário</label>
                                <div className="flex space-x-2">
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="bg-industrial-dark border border-gray-800 rounded-2xl px-4 py-4 text-white text-xs font-bold focus:border-copper outline-none flex-1"
                                    />
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={(e) => setTime(e.target.value)}
                                        className="bg-industrial-dark border border-gray-800 rounded-2xl px-4 py-4 text-white text-xs font-bold focus:border-copper outline-none w-28"
                                    />
                                </div>
                            </section>
                        </div>

                        {/* Conflict Warning */}
                        {conflict && (
                            <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-[2rem] animate-pulse">
                                <div className="flex items-start space-x-4">
                                    <AlertTriangle className="text-red-500 shrink-0" size={24} />
                                    <div>
                                        <p className="text-red-500 font-bold text-sm leading-tight uppercase italic">{conflict.message}</p>
                                        {conflict.suggestion && (
                                            <button
                                                onClick={() => setSelectedBarber(conflict.suggestion.id)}
                                                className="mt-3 flex items-center space-x-2 bg-red-500 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
                                            >
                                                <span>Mudar para {conflict.suggestion.apelido.toUpperCase()}</span>
                                                <ChevronRight size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Products & Summary */}
                    <div className="w-full lg:w-[320px] bg-[#121212] p-10 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-800/50">
                        <div className="flex-1 space-y-8 overflow-y-auto">
                            <section className="space-y-4">
                                <label className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">Adicionar Produto</label>
                                <div className="space-y-2">
                                    {products.map(product => (
                                        <button
                                            key={product.id}
                                            onClick={() => toggleProduct(product)}
                                            className={`w-full p-4 rounded-xl border text-left flex justify-between items-center transition-all ${selectedProducts.find(p => p.id === product.id)
                                                    ? 'bg-copper/20 border-copper/50 text-white'
                                                    : 'bg-[#161616] border-gray-800 text-gray-500 hover:border-gray-700'
                                                }`}
                                        >
                                            <div className="font-bold text-[10px] uppercase truncate flex-1">{product.name}</div>
                                            <span className="text-[10px] font-black text-gray-400">R$ {product.value}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <div className="pt-8 border-t border-gray-800 space-y-4">
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest italic">Resumo</h3>
                                <div className="space-y-2">
                                    {selectedServices.map(s => (
                                        <div key={s.id} className="flex justify-between text-[10px] font-bold text-gray-500 uppercase">
                                            <span>{s.name}</span>
                                            <span>R$ {s.value.toFixed(2)}</span>
                                        </div>
                                    ))}
                                    {selectedProducts.map(p => (
                                        <div key={p.id} className="flex justify-between text-[10px] font-bold text-copper uppercase">
                                            <span>{p.name} (x{p.quantity})</span>
                                            <span>R$ {(p.value * p.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 mt-8 border-t border-gray-800 space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none">Total</span>
                                <span className="text-3xl font-black text-white tracking-tighter italic">
                                    R$ {(
                                        selectedServices.reduce((acc, s) => acc + s.value, 0) +
                                        selectedProducts.reduce((acc, p) => acc + (p.value * p.quantity), 0)
                                    ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={!!conflict}
                                className={`w-full py-5 rounded-3xl font-black uppercase text-center transition-all shadow-2xl flex items-center justify-center space-x-3 ${conflict
                                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                        : 'bg-copper hover:bg-copper-light text-white active:scale-95'
                                    }`}
                            >
                                <Check size={24} strokeWidth={3} />
                                <span>CONCLUIR</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuickAppointmentModal;
