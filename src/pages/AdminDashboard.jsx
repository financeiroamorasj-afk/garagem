import React, { useState } from 'react';
import {
    TrendingUp,
    Users,
    Package,
    Settings,
    DollarSign,
    Clock,
    Plus,
    CheckCircle,
    BarChart3,
    CreditCard,
    Monitor,
    Eye,
    RotateCcw,
    ToggleRight,
    Scissors,
    ChevronRight,
    Trash2,
    Pencil,
    UserPlus,
    ArrowUpRight,
    AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ServiceProductModal from '../components/ServiceProductModal';
import BarberModal from '../components/BarberModal';
import QuickAppointmentModal from '../components/QuickAppointmentModal';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [, setIsExtraHoursModalOpen] = useState(false);

    // Modais de Serviço
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [editingService, setEditingService] = useState(null);

    // Modais de Equipe
    const [isBarberModalOpen, setIsBarberModalOpen] = useState(false);
    const [editingBarber, setEditingBarber] = useState(null);

    // Modais de Produto
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    // Modal de Agendamento Rápido (Novo Corte)
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);

    // --- MOCK DATA ---
    const [services, setServices] = useState([
        { id: '1', name: 'Corte Degradê', value: 45.00, duration: 30, description: 'Corte moderno com acabamento em degradê.' },
        { id: '2', name: 'Barba Completa', value: 35.00, duration: 45, description: 'Barba com toalha quente e balm.' },
        { id: '3', name: 'Corte & Barba', value: 70.00, duration: 75, description: 'Combo promocional.' },
    ]);

    const [professionals, setProfessionals] = useState([
        { id: '1', nome: 'Dener da Silva', apelido: 'Dener', telefone: '(11) 98888-7777', endereco: 'Rua das Barbearias, 123' },
        { id: '2', nome: 'Vinícius Rocha', apelido: 'Vini', telefone: '(11) 97777-6666', endereco: 'Av. do Degradê, 456' },
        { id: '3', nome: 'Ruan Pablo', apelido: 'Ruan', telefone: '(11) 96666-5555', endereco: 'Travessa da Navalha, 789' },
        { id: '4', nome: 'Lucas Alvares', apelido: 'Lucas', telefone: '(11) 95555-4444', endereco: 'Rua do Pompadour, 101' },
    ]);

    const [clients, setClients] = useState([
        { id: '1', nome: 'Carlos Andrade', apelido: 'Carlinhos', telefone: '(11) 99999-8888' },
        { id: '2', nome: 'Roberto Alves', apelido: 'Beto', telefone: '(11) 98888-1111' },
        { id: '3', nome: 'Fernando Silva', apelido: 'Fernandinho', telefone: '(11) 97777-2222' },
    ]);

    const [appointments, setAppointments] = useState([
        { id: '1', barberId: '1', clientId: '1', clientName: 'Carlos Andrade', date: new Date().toISOString().split('T')[0], time: '09:00', duration: 30, services: [{ name: 'Corte Degradê' }] },
        { id: '2', barberId: '2', clientId: '2', clientName: 'Roberto Alves', date: new Date().toISOString().split('T')[0], time: '10:30', duration: 60, services: [{ name: 'Corte & Barba' }] },
    ]);

    const [inventory, setInventory] = useState([
        { id: '1', name: 'Pomada Matte Garagem', cost: 15.00, value: 45.00, stock: 24 },
        { id: '2', name: 'Óleo para Barba', cost: 12.00, value: 35.00, stock: 12 },
        { id: '3', name: 'Shampoo Mentolado', cost: 18.00, value: 55.00, stock: 8 },
    ]);

    const stats = [
        { label: 'Faturamento Semana', value: 'R$ 8.450,00', icon: <DollarSign size={20} />, trend: '+12.5%' },
        { label: 'Ticket Médio', value: 'R$ 85,00', icon: <TrendingUp size={20} />, trend: '+3.1%' },
        { label: 'Serviços Realizados', value: '142', icon: <CheckCircle size={20} />, trend: '+8%' },
    ];

    const teamPayouts = [
        { name: 'Dener', services: 4200, products: 500, paid: false },
        { name: 'Vini', services: 3800, products: 300, paid: true },
        { name: 'Ruan', services: 2900, products: 200, paid: false },
    ];

    // --- LOGICA DE HORARIOS SEMANAIS ---
    const INITIAL_TEMPLATE = {
        open: '08:00', close: '19:00',
        lunchStart: '12:00', lunchEnd: '13:30',
        active: true
    };

    const [standardTemplate, setStandardTemplate] = useState(INITIAL_TEMPLATE);

    const [weeklySchedule, setWeeklySchedule] = useState({
        segunda: { ...INITIAL_TEMPLATE },
        terca: { ...INITIAL_TEMPLATE },
        quarta: { ...INITIAL_TEMPLATE },
        quinta: { ...INITIAL_TEMPLATE },
        sexta: { ...INITIAL_TEMPLATE },
        sabado: { ...INITIAL_TEMPLATE, close: '16:00' },
    });

    const handleUpdateDay = (day, field, value) => {
        setWeeklySchedule(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: value }
        }));
    };

    const applyTemplateToAll = () => {
        const updated = {};
        Object.keys(weeklySchedule).forEach(day => {
            updated[day] = { ...standardTemplate };
        });
        setWeeklySchedule(updated);
    };

    // --- HANDLERS SERVIÇOS ---
    const handleOpenServiceModal = (service = null) => {
        setEditingService(service);
        setIsServiceModalOpen(true);
    };

    const handleSaveService = (data) => {
        if (editingService) {
            setServices(services.map(s => s.id === editingService.id ? { ...s, ...data } : s));
        } else {
            setServices([...services, { id: Math.random().toString(), ...data }]);
        }
        setIsServiceModalOpen(false);
        setEditingService(null);
    };

    // --- HANDLERS EQUIPE ---
    const handleOpenBarberModal = (barber = null) => {
        setEditingBarber(barber);
        setIsBarberModalOpen(true);
    };

    const handleSaveBarber = (data) => {
        if (editingBarber) {
            setProfessionals(professionals.map(p => p.id === editingBarber.id ? { ...p, ...data } : p));
        } else {
            setProfessionals([...professionals, { id: Math.random().toString(), ...data }]);
        }
        setIsBarberModalOpen(false);
        setEditingBarber(null);
    };

    // --- HANDLERS PRODUTOS ---
    const handleOpenProductModal = (product = null) => {
        setEditingProduct(product);
        setIsProductModalOpen(true);
    };

    const handleSaveProduct = (data) => {
        if (editingProduct) {
            setInventory(inventory.map(p => p.id === editingProduct.id ? { ...p, ...data } : p));
        } else {
            setInventory([...inventory, { id: Math.random().toString(), stock: 0, ...data }]);
        }
        setIsProductModalOpen(false);
        setEditingProduct(null);
    };

    const handleSaveAppointment = (data) => {
        // Se o cliente for novo, cadastra ele
        if (data.clientId === 'new') {
            const newClient = { id: Math.random().toString(), nome: data.clientName, apelido: '', telefone: '' };
            setClients([...clients, newClient]);
            data.clientId = newClient.id;
        }

        const newAppointment = {
            id: Math.random().toString(),
            ...data
        };

        setAppointments([...appointments, newAppointment]);
        setIsAppointmentModalOpen(false);

        // Feedback visual ou log
        console.log('Agendamento Salvo:', newAppointment);
        alert(`Agendamento de ${data.clientName} confirmado!`);
    };

    const deleteProduct = (id) => {
        if (window.confirm('Excluir este produto do inventário?')) {
            setInventory(inventory.filter(p => p.id !== id));
        }
    };

    return (
        <div className="min-h-full bg-surface-0 text-warm-white tracking-tight">
            {/* Sidebar Gerencial */}
            <aside className="hidden" aria-hidden="true">
                <div className="px-6 mb-10">
                    <h2 className="text-display text-copper uppercase">GARAGEM</h2>
                    <p className="text-label text-steel mt-1">SISTEMA DE GESTÃO</p>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    <a
                        href="/reception/board"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-4 py-4 mb-6 rounded-sm font-sans font-semibold text-label bg-copper/10 text-copper border border-copper/30 hover:bg-copper hover:text-warm-white transition duration-100 ease-brand shadow-[0_4px_15px_rgba(184,115,51,0.1)]"
                    >
                        <Monitor size={18} />
                        <span>📺 ABRIR AGENDA GERAL</span>
                    </a>

                    {[
                        { id: 'overview', label: 'Visão Geral', icon: <BarChart3 size={18} /> },
                        { id: 'team', label: 'Equipe & Payouts', icon: <Users size={18} /> },
                        { id: 'services', label: 'Serviços', icon: <Scissors size={18} /> },
                        { id: 'inventory', label: 'Estoque & Produtos', icon: <Package size={18} /> },
                        { id: 'settings', label: 'Configurações', icon: <Settings size={18} /> },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-sm font-sans font-semibold text-sm transition duration-100 ease-brand ${activeTab === item.id ? 'bg-copper text-surface-0 shadow-lg' : 'text-steel hover:text-warm-white hover:bg-surface-2'
                                }`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="min-w-0 p-6">
                <header className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-h1 text-warm-white uppercase">
                            {activeTab === 'settings' ? 'Configurações da Unidade' :
                                activeTab === 'services' ? 'Gestão de Serviços' :
                                    activeTab === 'team' ? 'Gestão de Equipe' :
                                        activeTab === 'inventory' ? 'Controle de Estoque' :
                                            'Dashboard Financeiro'}
                        </h1>
                        <p className="text-body-sm text-steel mt-1">
                            {activeTab === 'settings' ? 'Organize o horário de funcionamento e padrões da loja.' :
                                activeTab === 'services' ? 'Cadastre os cortes, barbas e tratamentos oferecidos.' :
                                    activeTab === 'team' ? 'Gerencie seus profissionais parceiros e comissões.' :
                                        activeTab === 'inventory' ? 'Acompanhe custo, lucro e quantidade de produtos em tempo real.' :
                                            'Pulsando os números da sua barbearia.'}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row">
                        <Button
                            variant="secondary"
                            size="lg"
                            onClick={() => setIsExtraHoursModalOpen(true)}
                            className="gap-2"
                        >
                            <Clock size={20} />
                            <span>LIBERAR HORÁRIO EXTRA</span>
                        </Button>
                        <Button
                            variant="primary"
                            size="lg"
                            className="gap-2 shadow-xl"
                            onClick={() => {
                                if (activeTab === 'services') handleOpenServiceModal();
                                if (activeTab === 'team') handleOpenBarberModal();
                                if (activeTab === 'inventory') handleOpenProductModal();
                                if (activeTab === 'overview' || activeTab === 'settings') setIsAppointmentModalOpen(true);
                            }}
                        >
                            <Plus size={20} strokeWidth={3} />
                            <span>
                                {activeTab === 'services' ? 'NOVO SERVIÇO' :
                                    activeTab === 'inventory' ? 'NOVO PRODUTO' :
                                        activeTab === 'team' ? 'NOVO BARBEIRO' :
                                            'NOVO CORTE'}
                            </span>
                        </Button>
                    </div>
                </header>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {stats.map((stat, i) => (
                                <Card key={i} className="shadow-xl hover:border-line-strong transition-colors duration-100 ease-brand">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-surface-2 rounded-sm text-copper">
                                            {stat.icon}
                                        </div>
                                        <Badge variant="success">{stat.trend}</Badge>
                                    </div>
                                    <div className="text-label text-steel mb-1">{stat.label}</div>
                                    <div className="text-data-lg text-warm-white">{stat.value}</div>
                                </Card>
                            ))}
                        </div>

                        <Card className="p-0 overflow-hidden shadow-2xl">
                            <div className="px-8 py-8 border-b border-line flex justify-between items-center">
                                <h3 className="text-h2 text-warm-white uppercase">Fechamento Semanal da Equipe</h3>
                                <Badge variant="neutral">Período: 15/02 - 21/02</Badge>
                            </div>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-steel text-label border-b border-line">
                                        <th className="px-8 py-4">Profissional</th>
                                        <th className="px-8 py-4 text-right">Valor a Pagar</th>
                                        <th className="px-8 py-4 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {teamPayouts.map((pro, i) => {
                                        const payout = (pro.services * 0.5) + (pro.products * 0.1);
                                        return (
                                            <tr key={i} className="hover:bg-warm-white/5 transition-colors duration-100 ease-brand">
                                                <td className="px-8 py-6">
                                                    <span className="font-semibold text-warm-white">{pro.name}</span>
                                                </td>
                                                <td className="px-8 py-6 text-data-lg text-warm-white text-right">R$ {payout.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-8 py-6 text-right">
                                                    <Button variant="secondary" size="sm">Pagar</Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </Card>
                    </div>
                )}

                {/* Team Tab */}
                {activeTab === 'team' && (
                    <div className="space-y-6">
                        <Card className="p-0 overflow-hidden shadow-2xl">
                            <div className="px-8 py-8 border-b border-line flex justify-between items-center">
                                <h3 className="text-h2 text-warm-white uppercase">Profissionais Parceiros</h3>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => handleOpenBarberModal()}
                                >
                                    <UserPlus size={16} />
                                    <span>Adicionar Barbeiro</span>
                                </Button>
                            </div>
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {professionals.map(pro => (
                                    <div key={pro.id} className="bg-surface-0 border border-line p-8 rounded-md flex flex-col justify-between group hover:border-copper transition-colors duration-100 ease-brand relative overflow-hidden">
                                        <div className="flex items-start justify-between mb-8">
                                            <div className="flex items-center space-x-6">
                                                <div className="w-16 h-16 rounded-md bg-copper/20 flex items-center justify-center text-copper font-black text-2xl">
                                                    {pro.apelido.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-warm-white uppercase text-lg">{pro.nome}</div>
                                                    <div className="text-label text-steel flex items-center space-x-1">
                                                        <CheckCircle size={10} className="text-success" />
                                                        <span>Disponível no sistema</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button onClick={() => handleOpenBarberModal(pro)} className="p-3 bg-surface-1 border border-line rounded-sm text-steel hover:text-copper transition-colors duration-100 ease-brand"><Pencil size={18} /></button>
                                                <button onClick={() => { if (window.confirm('Remover?')) setProfessionals(professionals.filter(p => p.id !== pro.id)) }} className="p-3 bg-surface-1 border border-line rounded-sm text-steel hover:text-danger transition-colors duration-100 ease-brand"><Trash2 size={18} /></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-8">
                                            <div className="bg-surface-1 p-4 rounded-sm border border-line">
                                                <span className="text-label text-steel block mb-1">WhatsApp</span>
                                                <span className="text-body-sm font-semibold text-warm-white">{pro.telefone}</span>
                                            </div>
                                            <div className="bg-surface-1 p-4 rounded-sm border border-line">
                                                <span className="text-label text-steel block mb-1">Apelido</span>
                                                <span className="text-body-sm font-semibold text-copper">{pro.apelido}</span>
                                            </div>
                                        </div>
                                        <Button variant="secondary" size="md" className="w-full gap-2" onClick={() => navigate('/barber/dashboard')}>
                                            <Eye size={16} />
                                            <span>Espiar Agenda</span>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* Inventory Tab - TABLE UI */}
                {activeTab === 'inventory' && (
                    <div className="bg-surface-1 border border-line rounded-md overflow-hidden shadow-2xl">
                        {/* Tabela de Produtos */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-surface-0 text-steel text-label border-b border-line">
                                        <th className="px-10 py-8 text-copper">Produto</th>
                                        <th className="px-6 py-8">Custo Unit.</th>
                                        <th className="px-6 py-8">Preço Venda</th>
                                        <th className="px-6 py-8">Markup / Lucro</th>
                                        <th className="px-6 py-8 text-center">Estoque</th>
                                        <th className="px-10 py-8 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {inventory.map((item) => {
                                        const profit = item.value - item.cost;
                                        const margin = ((profit / item.value) * 100).toFixed(0);
                                        return (
                                            <tr key={item.id} className="hover:bg-warm-white/5 transition-colors duration-100 ease-brand group">
                                                <td className="px-10 py-6">
                                                    <div className="flex items-center space-x-4">
                                                        <div className="w-12 h-12 bg-surface-2 rounded-sm flex items-center justify-center text-steel group-hover:bg-copper/20 group-hover:text-copper transition-colors duration-100 ease-brand">
                                                            <Package size={20} />
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-warm-white uppercase text-base">{item.name}</div>
                                                            <div className="text-label text-steel">Ativo no PDV</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 text-data text-steel">R$ {item.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-6 text-data text-warm-white">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-data text-success">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        <span className="text-label text-success/60">{margin}% Margem</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 text-center">
                                                    <Badge variant={item.stock < 10 ? 'danger' : 'neutral'}>{item.stock} uni</Badge>
                                                </td>
                                                <td className="px-10 py-6 text-right">
                                                    <div className="flex justify-end space-x-2">
                                                        <button onClick={() => handleOpenProductModal(item)} className="p-3 bg-surface-0 border border-line rounded-sm text-steel hover:text-copper transition-colors duration-100 ease-brand"><Pencil size={18} /></button>
                                                        <button onClick={() => deleteProduct(item.id)} className="p-3 bg-surface-0 border border-line rounded-sm text-steel hover:text-danger transition-colors duration-100 ease-brand"><Trash2 size={18} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Informativo da Spreadsheet */}
                        <div className="p-8 bg-copper/5 border-t border-line flex justify-between items-center">
                            <div className="flex items-center space-x-4">
                                <div className="bg-copper/10 p-2 rounded-sm text-copper">
                                    <AlertCircle size={20} />
                                </div>
                                <p className="text-label text-steel">O preço sugerido de venda considera markup mínimo de 30%.</p>
                            </div>
                            <div className="text-right">
                                <div className="text-label text-steel mb-1">Valor em Estoque</div>
                                <div className="text-data-lg text-warm-white">
                                    {inventory.reduce((acc, curr) => acc + (curr.cost * curr.stock), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Services Tab */}
                {activeTab === 'services' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {services.map((service) => (
                            <Card key={service.id} className="p-8 shadow-xl hover:border-copper/50 transition-colors duration-100 ease-brand group relative">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="bg-copper/10 p-4 rounded-md text-copper group-hover:scale-110 transition-transform duration-100 ease-brand"><Scissors size={24} /></div>
                                    <div className="flex space-x-3">
                                        <button onClick={() => handleOpenServiceModal(service)} className="p-2 text-steel hover:text-copper transition-colors duration-100 ease-brand"><Pencil size={18} /></button>
                                        <button onClick={() => { if (window.confirm('Excluir?')) setServices(services.filter(s => s.id !== service.id)) }} className="p-2 text-steel hover:text-danger transition-colors duration-100 ease-brand"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                                <h4 className="text-h2 text-warm-white uppercase mb-1">{service.name}</h4>
                                <div className="flex items-center space-x-2 mb-4">
                                    <Clock size={12} className="text-steel" />
                                    <span className="text-label text-steel">{service.duration} Minutos</span>
                                </div>
                                <p className="text-body-sm text-steel mb-6 h-8 line-clamp-2">{service.description}</p>
                                <div className="flex justify-between items-center border-t border-line pt-6">
                                    <span className="text-label text-steel">Valor do Corte</span>
                                    <span className="text-data-lg text-warm-white">R$ {service.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className="space-y-10">
                        <div className="bg-surface-1 p-10 rounded-md border-2 border-copper/20 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-copper/5 rounded-full -mr-16 -mt-16 blur-3xl transition-colors duration-100 ease-brand group-hover:bg-copper/10"></div>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                                <div>
                                    <h3 className="text-h2 text-warm-white uppercase">Configuração Padrão (Template)</h3>
                                    <p className="text-body-sm text-steel">Defina o horário base que servirá de modelo para toda a semana.</p>
                                </div>
                                <Button variant="primary" size="lg" className="gap-3" onClick={applyTemplateToAll}><RotateCcw size={18} /><span>APLICAR PADRÃO A TODOS OS DIAS</span></Button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <Input label="Abertura" type="time" value={standardTemplate.open} onChange={(e) => setStandardTemplate({ ...standardTemplate, open: e.target.value })} />
                                <Input label="Fechamento" type="time" value={standardTemplate.close} onChange={(e) => setStandardTemplate({ ...standardTemplate, close: e.target.value })} />
                                <Input label="Ini. Almoço" type="time" value={standardTemplate.lunchStart} onChange={(e) => setStandardTemplate({ ...standardTemplate, lunchStart: e.target.value })} />
                                <Input label="Fim Almoço" type="time" value={standardTemplate.lunchEnd} onChange={(e) => setStandardTemplate({ ...standardTemplate, lunchEnd: e.target.value })} />
                            </div>
                        </div>

                        {/* WEEKLY REPEATER */}
                        <Card className="p-0 overflow-hidden shadow-2xl">
                            <div className="px-10 py-10 border-b border-line flex justify-between items-center">
                                <h3 className="text-h2 text-warm-white uppercase">Agenda Semanal</h3>
                                <span className="text-label text-steel">Personalize cada dia</span>
                            </div>

                            <div className="divide-y divide-line">
                                {Object.entries(weeklySchedule).map(([dayKey, dayData]) => (
                                    <div key={dayKey} className="p-8 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 hover:bg-warm-white/5 transition-colors duration-100 ease-brand">
                                        <div className="w-40 shrink-0">
                                            <h4 className="text-h3 text-copper uppercase">{dayKey}</h4>
                                            <button
                                                onClick={() => handleUpdateDay(dayKey, 'active', !dayData.active)}
                                                className={`flex items-center space-x-2 mt-1 text-label ${dayData.active ? 'text-success' : 'text-danger'}`}
                                            >
                                                <ToggleRight size={16} className={dayData.active ? '' : 'rotate-180'} />
                                                <span>{dayData.active ? 'Aberto' : 'Fechado'}</span>
                                            </button>
                                        </div>

                                        <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 transition-all ${dayData.active ? 'opacity-100' : 'opacity-20 pointer-events-none grayscale'}`}>
                                            <Input
                                                label="Abertura"
                                                type="time"
                                                value={dayData.open}
                                                onChange={(e) => handleUpdateDay(dayKey, 'open', e.target.value)}
                                            />
                                            <Input
                                                label="Fechamento"
                                                type="time"
                                                value={dayData.close}
                                                onChange={(e) => handleUpdateDay(dayKey, 'close', e.target.value)}
                                            />
                                            <Input
                                                label="Ini. Almoço"
                                                type="time"
                                                value={dayData.lunchStart}
                                                onChange={(e) => handleUpdateDay(dayKey, 'lunchStart', e.target.value)}
                                            />
                                            <Input
                                                label="Fim Almoço"
                                                type="time"
                                                value={dayData.lunchEnd}
                                                onChange={(e) => handleUpdateDay(dayKey, 'lunchEnd', e.target.value)}
                                            />
                                        </div>

                                        <div className="shrink-0 xl:ml-6">
                                            <button
                                                onClick={() => {
                                                    const updated = { ...weeklySchedule };
                                                    updated[dayKey] = { ...standardTemplate };
                                                    setWeeklySchedule(updated);
                                                }}
                                                className="p-3 text-steel hover:text-copper transition-colors duration-100 ease-brand"
                                                title="Resetar para padrão"
                                            >
                                                <RotateCcw size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Button variant="primary" size="lg" className="w-full py-8 text-lg shadow-2xl">
                            SALVAR TODAS AS CONFIGURAÇÕES
                        </Button>
                    </div>
                )}

                {/* MODAL SERVIÇOS */}
                <ServiceProductModal
                    isOpen={isServiceModalOpen}
                    onClose={() => { setIsServiceModalOpen(false); setEditingService(null); }}
                    onSave={handleSaveService}
                    type="service"
                    initialData={editingService}
                />

                {/* MODAL PRODUTOS */}
                <ServiceProductModal
                    isOpen={isProductModalOpen}
                    onClose={() => { setIsProductModalOpen(false); setEditingProduct(null); }}
                    onSave={handleSaveProduct}
                    type="product"
                    initialData={editingProduct}
                />

                {/* MODAL EQUIPE */}
                <BarberModal
                    isOpen={isBarberModalOpen}
                    onClose={() => { setIsBarberModalOpen(false); setEditingBarber(null); }}
                    onSave={handleSaveBarber}
                    initialData={editingBarber}
                />

                {/* MODAL NOVO CORTE (QUICK APPOINTMENT) */}
                <QuickAppointmentModal
                    isOpen={isAppointmentModalOpen}
                    onClose={() => setIsAppointmentModalOpen(false)}
                    onSave={handleSaveAppointment}
                    professionals={professionals}
                    services={services}
                    products={inventory}
                    clients={clients}
                    appointments={appointments}
                />
            </main>
        </div>
    );
};

export default AdminDashboard;
