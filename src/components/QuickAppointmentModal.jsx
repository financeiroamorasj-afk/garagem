import React, { useMemo, useState } from 'react';
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
import Button from './ui/Button';

const timeToMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

const QuickAppointmentModalContent = ({
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
    const [selectedBarber, setSelectedBarber] = useState(() => professionals[0]?.id || '');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('10:00');
    const [selectedProducts, setSelectedProducts] = useState([]);
    const activeBarber = selectedBarber || professionals[0]?.id || '';

    // Conflict Detection Logic
    const conflict = useMemo(() => {
        if (!activeBarber || !date || !time || selectedServices.length === 0) return null;

        const totalDuration = selectedServices.reduce((acc, service) => acc + (service.duration || 30), 0);
        const startMinutes = timeToMinutes(time);
        const endMinutes = startMinutes + totalDuration;
        const overlaps = (appointment, barberId) => {
            if (appointment.barberId !== barberId || appointment.date !== date) return false;

            const appointmentStart = timeToMinutes(appointment.time);
            const appointmentEnd = appointmentStart + appointment.duration;
            return startMinutes < appointmentEnd && endMinutes > appointmentStart;
        };

        if (!appointments.some(appointment => overlaps(appointment, activeBarber))) return null;

        const suggestion = professionals.find(professional => (
            professional.id !== activeBarber
            && !appointments.some(appointment => overlaps(appointment, professional.id))
        ));

        return {
            message: 'O barbeiro já possui um agendamento neste horário.',
            suggestion: suggestion || null,
        };
    }, [activeBarber, appointments, date, professionals, selectedServices, time]);

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
        if (!selectedClient || selectedServices.length === 0 || !activeBarber) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        const totalDuration = selectedServices.reduce((acc, s) => acc + (s.duration || 30), 0);
        const totalValue = selectedServices.reduce((acc, s) => acc + s.value, 0) +
            selectedProducts.reduce((acc, p) => acc + (p.value * p.quantity), 0);

        onSave({
            clientId: selectedClient.id,
            clientName: selectedClient.nome,
            barberId: activeBarber,
            services: selectedServices,
            products: selectedProducts,
            date,
            time,
            duration: totalDuration,
            totalValue
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-hidden bg-surface-0/80 p-0 backdrop-blur-md sm:items-center sm:p-4">
            <div className="flex max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-md border border-line bg-surface-3 shadow-overlay sm:max-h-[calc(100dvh-2rem)] sm:rounded-md">

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-line p-4 sm:p-6 lg:p-8">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="shrink-0 rounded-md bg-copper/10 p-2.5 text-copper sm:p-3">
                            <Scissors size={22} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="truncate text-h2 text-warm-white uppercase sm:text-h1">NOVO CORTE</h2>
                            <p className="text-label text-steel leading-none">Agendamento & Venda</p>
                        </div>
                    </div>
                    <button aria-label="Fechar" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-steel transition-colors duration-100 ease-brand hover:bg-surface-2 hover:text-warm-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
                    {/* Left Column: Form */}
                    <div className="flex-1 space-y-7 p-4 sm:p-6 lg:overflow-y-auto lg:border-r lg:border-line lg:p-10">

                        {/* Client Search */}
                        <section className="space-y-3">
                            <label className="text-label text-steel">Cliente</label>
                            <ClientSearch
                                clients={clients}
                                onSelect={setSelectedClient}
                            />
                            {selectedClient && (
                                <div className="mt-2 inline-flex items-center gap-2 bg-copper/10 text-copper px-4 py-2 rounded-sm w-fit">
                                    <User size={14} />
                                    <span className="text-label">{selectedClient.nome}</span>
                                </div>
                            )}
                        </section>

                        {/* Service Multi-Select */}
                        <section className="space-y-4">
                            <div className="flex justify-between items-end">
                                <label className="text-label text-steel">Serviços</label>
                                <span className="text-label text-copper">
                                    Total: {selectedServices.reduce((acc, s) => acc + (s.duration || 30), 0)} min
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {services.map(service => (
                                    <button
                                        key={service.id}
                                        onClick={() => toggleService(service)}
                                        className={`relative min-h-16 overflow-hidden rounded-sm border p-4 text-left transition-colors duration-100 ease-brand group ${selectedServices.find(s => s.id === service.id)
                                                ? 'bg-copper text-surface-0 border-copper shadow-lg'
                                                : 'bg-surface-2 border-line text-steel hover:border-line-strong'
                                            }`}
                                    >
                                        <div className="text-label truncate pr-10">{service.name}</div>
                                        <div className="text-label opacity-60 mt-1">{service.duration} min • R$ {service.value}</div>
                                        {selectedServices.find(s => s.id === service.id) && (
                                            <Check className="absolute top-4 right-4" size={16} />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Professional & Time */}
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <section className="space-y-3">
                                <label className="text-label text-steel">Profissional</label>
                                <select
                                    value={activeBarber}
                                    onChange={(e) => setSelectedBarber(e.target.value)}
                                    className="w-full appearance-none rounded-sm border border-line-strong bg-surface-2 px-4 py-3.5 text-body font-semibold text-warm-white outline-none focus:border-copper sm:px-6 sm:py-4"
                                >
                                    {professionals.map(pro => (
                                        <option key={pro.id} value={pro.id}>{pro.apelido}</option>
                                    ))}
                                </select>
                            </section>
                            <section className="space-y-3">
                                <label className="text-label text-steel">Horário</label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-2 px-3 py-3.5 text-body-sm font-semibold text-warm-white outline-none focus:border-copper sm:px-4 sm:py-4"
                                    />
                                    <input
                                        type="time"
                                        value={time}
                                        onChange={(e) => setTime(e.target.value)}
                                        className="w-full rounded-sm border border-line-strong bg-surface-2 px-3 py-3.5 text-body-sm font-semibold text-warm-white outline-none focus:border-copper sm:w-28 sm:px-4 sm:py-4"
                                    />
                                </div>
                            </section>
                        </div>

                        {/* Conflict Warning */}
                        {conflict && (
                            <div className="animate-pulse rounded-md border border-danger/40 bg-danger/12 p-4 sm:p-6">
                                <div className="flex items-start space-x-4">
                                    <AlertTriangle className="text-danger shrink-0" size={24} />
                                    <div>
                                        <p className="text-danger text-body-sm uppercase leading-tight">{conflict.message}</p>
                                        {conflict.suggestion && (
                                            <button
                                                onClick={() => setSelectedBarber(conflict.suggestion.id)}
                                                className="mt-3 flex items-center space-x-2 bg-danger text-warm-white px-4 py-2 rounded-sm text-label hover:brightness-[1.1] transition duration-100 ease-brand"
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
                    <div className="flex w-full shrink-0 flex-col border-t border-line bg-surface-0 p-4 sm:p-6 lg:w-[320px] lg:border-l lg:border-t-0 lg:p-10">
                        <div className="flex-1 space-y-8 overflow-y-auto">
                            <section className="space-y-4">
                                <label className="text-label text-steel">Adicionar Produto</label>
                                <div className="space-y-2">
                                    {products.map(product => (
                                        <button
                                            key={product.id}
                                            onClick={() => toggleProduct(product)}
                                            className={`w-full p-4 rounded-sm border text-left flex justify-between items-center transition-colors duration-100 ease-brand ${selectedProducts.find(p => p.id === product.id)
                                                    ? 'bg-copper/20 border-copper/50 text-warm-white'
                                                    : 'bg-surface-2 border-line text-steel hover:border-line-strong'
                                                }`}
                                        >
                                            <div className="text-label truncate flex-1">{product.name}</div>
                                            <span className="text-data text-steel">R$ {product.value}</span>
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <div className="pt-8 border-t border-line space-y-4">
                                <h3 className="text-label text-steel">Resumo</h3>
                                <div className="space-y-2">
                                    {selectedServices.map(s => (
                                        <div key={s.id} className="flex justify-between text-label text-steel">
                                            <span>{s.name}</span>
                                            <span>R$ {s.value.toFixed(2)}</span>
                                        </div>
                                    ))}
                                    {selectedProducts.map(p => (
                                        <div key={p.id} className="flex justify-between text-label text-copper">
                                            <span>{p.name} (x{p.quantity})</span>
                                            <span>R$ {(p.value * p.quantity).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 mt-8 border-t border-line space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-label text-steel leading-none">Total</span>
                                <span className="text-data-lg text-warm-white">
                                    R$ {(
                                        selectedServices.reduce((acc, s) => acc + s.value, 0) +
                                        selectedProducts.reduce((acc, p) => acc + (p.value * p.quantity), 0)
                                    ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <Button
                                variant="primary"
                                size="lg"
                                disabled={!!conflict}
                                onClick={handleSave}
                                className="w-full gap-3 shadow-2xl"
                            >
                                <Check size={24} strokeWidth={3} />
                                <span>CONCLUIR</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const QuickAppointmentModal = ({ isOpen, ...props }) => {
    if (!isOpen) return null;

    return <QuickAppointmentModalContent {...props} />;
};

export default QuickAppointmentModal;
