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
import CurrencyInput from '../components/CurrencyInput';
import ServiceProductModal from '../components/ServiceProductModal';
import BarberModal from '../components/BarberModal';
import QuickAppointmentModal from '../components/QuickAppointmentModal';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('overview');
    const [isExtraHoursModalOpen, setIsExtraHoursModalOpen] = useState(false);

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
        <div className="min-h-screen bg-[#121212] text-white flex tracking-tight">
            {/* Sidebar Gerencial */}
            <aside className="w-64 border-r border-gray-800/50 bg-[#161616] flex flex-col pt-8">
                <div className="px-6 mb-10">
                    <h2 className="text-3xl font-black text-copper tracking-tighter uppercase italic">GARAGEM</h2>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">SISTEMA DE GESTÃO</p>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    <a
                        href="/reception/board"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center space-x-2 px-4 py-4 mb-6 rounded-2xl font-black text-xs bg-copper/10 text-copper border border-copper/30 hover:bg-copper hover:text-white transition-all shadow-[0_4px_15px_rgba(184,115,51,0.1)]"
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
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === item.id ? 'bg-copper text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                                }`}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-10 overflow-y-auto">
                <header className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-3xl font-black uppercase tracking-tighter">
                            {activeTab === 'settings' ? 'Configurações da Unidade' :
                                activeTab === 'services' ? 'Gestão de Serviços' :
                                    activeTab === 'team' ? 'Gestão de Equipe' :
                                        activeTab === 'inventory' ? 'Controle de Estoque' :
                                            'Dashboard Financeiro'}
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            {activeTab === 'settings' ? 'Organize o horário de funcionamento e padrões da loja.' :
                                activeTab === 'services' ? 'Cadastre os cortes, barbas e tratamentos oferecidos.' :
                                    activeTab === 'team' ? 'Gerencie seus profissionais parceiros e comissões.' :
                                        activeTab === 'inventory' ? 'Acompanhe custo, lucro e quantidade de produtos em tempo real.' :
                                            'Pulsando os números da sua barbearia.'}
                        </p>
                    </div>

                    <div className="flex space-x-4">
                        <button
                            onClick={() => setIsExtraHoursModalOpen(true)}
                            className="bg-transparent border-2 border-copper text-copper hover:bg-copper hover:text-white font-bold py-3 px-6 rounded-2xl transition-all flex items-center space-x-2"
                        >
                            <Clock size={20} />
                            <span>LIBERAR HORÁRIO EXTRA</span>
                        </button>
                        <button
                            onClick={() => {
                                if (activeTab === 'services') handleOpenServiceModal();
                                if (activeTab === 'team') handleOpenBarberModal();
                                if (activeTab === 'inventory') handleOpenProductModal();
                                if (activeTab === 'overview' || activeTab === 'settings') setIsAppointmentModalOpen(true);
                            }}
                            className="bg-copper hover:bg-copper-light text-white font-black py-3 px-8 rounded-2xl shadow-xl transition-all active:scale-95 flex items-center space-x-2"
                        >
                            <Plus size={20} strokeWidth={3} />
                            <span>
                                {activeTab === 'services' ? 'NOVO SERVIÇO' :
                                    activeTab === 'inventory' ? 'NOVO PRODUTO' :
                                        activeTab === 'team' ? 'NOVO BARBEIRO' :
                                            'NOVO CORTE'}
                            </span>
                        </button>
                    </div>
                </header>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {stats.map((stat, i) => (
                                <div key={i} className="bg-[#1a1a1a] border border-gray-800 p-6 rounded-3xl shadow-xl hover:border-gray-700 transition-colors">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-gray-800/50 rounded-2xl text-copper">
                                            {stat.icon}
                                        </div>
                                        <span className="text-emerald-500 text-xs font-bold bg-emerald-500/10 px-2 py-1 rounded-full">{stat.trend}</span>
                                    </div>
                                    <div className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-1">{stat.label}</div>
                                    <div className="text-3xl font-black text-white tracking-tighter">{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="p-8 border-b border-gray-800 flex justify-between items-center">
                                <h3 className="text-xl font-black uppercase tracking-tighter italic">Fechamento Semanal da Equipe</h3>
                                <span className="text-xs font-bold text-gray-500 bg-gray-800 px-3 py-1 rounded-full uppercase tracking-widest">Período: 15/02 - 21/02</span>
                            </div>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-gray-500 text-[10px] uppercase tracking-widest border-b border-gray-800/50">
                                        <th className="px-8 py-4 font-black italic">Profissional</th>
                                        <th className="px-8 py-4 font-black text-right">Valor a Pagar</th>
                                        <th className="px-8 py-4 font-black text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/30">
                                    {teamPayouts.map((pro, i) => {
                                        const payout = (pro.services * 0.5) + (pro.products * 0.1);
                                        return (
                                            <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                                                <td className="px-8 py-6">
                                                    <span className="font-bold">{pro.name}</span>
                                                </td>
                                                <td className="px-8 py-6 text-white font-black text-lg tracking-tighter text-right">R$ {payout.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-8 py-6 text-right">
                                                    <button className="text-[10px] font-black uppercase text-copper border border-copper px-4 py-2 rounded-full hover:bg-copper hover:text-white transition-all">Pagar</button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Team Tab */}
                {activeTab === 'team' && (
                    <div className="space-y-6">
                        <div className="bg-[#1a1a1a] border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="p-8 border-b border-gray-800 flex justify-between items-center">
                                <h3 className="text-xl font-black uppercase tracking-tighter italic">Profissionais Parceiros</h3>
                                <button
                                    onClick={() => handleOpenBarberModal()}
                                    className="bg-copper/10 text-copper border border-copper/30 px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-copper hover:text-white transition-all flex items-center space-x-2"
                                >
                                    <UserPlus size={16} />
                                    <span>Adicionar Barbeiro</span>
                                </button>
                            </div>
                            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                {professionals.map(pro => (
                                    <div key={pro.id} className="bg-[#121212] border border-gray-800 p-8 rounded-[2rem] flex flex-col justify-between group hover:border-copper transition-all relative overflow-hidden">
                                        <div className="flex items-start justify-between mb-8">
                                            <div className="flex items-center space-x-6">
                                                <div className="w-16 h-16 rounded-3xl bg-copper/20 flex items-center justify-center text-copper font-black text-2xl shadow-xl group-hover:rotate-6 transition-transform">
                                                    {pro.apelido.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-black text-white uppercase text-lg tracking-tighter">{pro.nome}</div>
                                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center space-x-1">
                                                        <CheckCircle size={10} className="text-emerald-500" />
                                                        <span>Disponível no sistema</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button onClick={() => handleOpenBarberModal(pro)} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl text-gray-500 hover:text-copper transition-all"><Pencil size={18} /></button>
                                                <button onClick={() => { if (window.confirm('Remover?')) setProfessionals(professionals.filter(p => p.id !== pro.id)) }} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl text-gray-500 hover:text-red-500 transition-all"><Trash2 size={18} /></button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-8">
                                            <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800/50">
                                                <span className="text-[9px] font-black text-gray-600 uppercase block mb-1">WhatsApp</span>
                                                <span className="text-xs font-bold text-gray-300">{pro.telefone}</span>
                                            </div>
                                            <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800/50">
                                                <span className="text-[9px] font-black text-gray-600 uppercase block mb-1">Apelido</span>
                                                <span className="text-xs font-bold text-copper">{pro.apelido}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => navigate('/barber/dashboard')} className="w-full flex items-center justify-center space-x-2 bg-copper/5 hover:bg-copper text-copper hover:text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                                            <Eye size={16} />
                                            <span>Espiar Agenda</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Inventory Tab - TABLE UI */}
                {activeTab === 'inventory' && (
                    <div className="bg-[#1a1a1a] border border-gray-800 rounded-[3rem] overflow-hidden shadow-2xl">
                        {/* Tabela de Produtos */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-[#161616] text-gray-500 text-[10px] uppercase font-black tracking-[0.2em] border-b border-gray-800">
                                        <th className="px-10 py-8 italic text-copper">Produto</th>
                                        <th className="px-6 py-8">Custo Unit.</th>
                                        <th className="px-6 py-8">Preço Venda</th>
                                        <th className="px-6 py-8">Markup / Lucro</th>
                                        <th className="px-6 py-8 text-center">Estoque</th>
                                        <th className="px-10 py-8 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/30">
                                    {inventory.map((item) => {
                                        const profit = item.value - item.cost;
                                        const margin = ((profit / item.value) * 100).toFixed(0);
                                        return (
                                            <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-10 py-6">
                                                    <div className="flex items-center space-x-4">
                                                        <div className="w-12 h-12 bg-gray-800/50 rounded-2xl flex items-center justify-center text-gray-500 group-hover:bg-copper/20 group-hover:text-copper transition-all">
                                                            <Package size={20} />
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-white uppercase text-base tracking-tighter">{item.name}</div>
                                                            <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Ativo no PDV</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 font-mono text-gray-400 text-sm">R$ {item.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-6 font-mono text-white text-base font-black">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="text-emerald-500 font-black text-sm tracking-tighter">R$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                        <span className="text-[9px] font-bold text-emerald-500/50 uppercase tracking-widest">{margin}% Margem</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 text-center">
                                                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.stock < 10 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-gray-800 text-gray-400'}`}>
                                                        {item.stock} uni
                                                    </span>
                                                </td>
                                                <td className="px-10 py-6 text-right">
                                                    <div className="flex justify-end space-x-2">
                                                        <button onClick={() => handleOpenProductModal(item)} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl text-gray-600 hover:text-copper transition-all"><Pencil size={18} /></button>
                                                        <button onClick={() => deleteProduct(item.id)} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl text-gray-600 hover:text-red-500 transition-all"><Trash2 size={18} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer Informativo da Spreadsheet */}
                        <div className="p-8 bg-copper/5 border-t border-gray-800 flex justify-between items-center">
                            <div className="flex items-center space-x-4">
                                <div className="bg-copper/10 p-2 rounded-lg text-copper">
                                    <AlertCircle size={20} />
                                </div>
                                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">O preço sugerido de venda considera markup mínimo de 30%.</p>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Valor em Estoque</div>
                                <div className="text-xl font-black text-white tracking-tighter">
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
                            <div key={service.id} className="bg-[#1a1a1a] border border-gray-800 p-8 rounded-[2.5rem] shadow-xl hover:border-copper/50 transition-all group relative">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="bg-copper/10 p-4 rounded-3xl text-copper group-hover:scale-110 transition-transform"><Scissors size={24} /></div>
                                    <div className="flex space-x-3">
                                        <button onClick={() => handleOpenServiceModal(service)} className="p-2 text-gray-800 hover:text-copper transition-colors"><Pencil size={18} /></button>
                                        <button onClick={() => { if (window.confirm('Excluir?')) setServices(services.filter(s => s.id !== service.id)) }} className="p-2 text-gray-800 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                                <h4 className="text-xl font-black uppercase tracking-tighter mb-1">{service.name}</h4>
                                <div className="flex items-center space-x-2 mb-4">
                                    <Clock size={12} className="text-gray-600" />
                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{service.duration} Minutos</span>
                                </div>
                                <p className="text-gray-500 text-xs mb-6 h-8 line-clamp-2">{service.description}</p>
                                <div className="flex justify-between items-center border-t border-gray-800 pt-6">
                                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Valor do Corte</span>
                                    <span className="text-2xl font-black text-white tracking-tighter">R$ {service.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className="space-y-10">
                        <div className="bg-[#1a1a1a] p-10 rounded-[3rem] border-2 border-copper/20 shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-copper/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-copper/10"></div>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 text-white">
                                <div>
                                    <h3 className="text-2xl font-black uppercase tracking-tighter">Configuração Padrão (Template)</h3>
                                    <p className="text-gray-500 text-sm">Defina o horário base que servirá de modelo para toda a semana.</p>
                                </div>
                                <button onClick={applyTemplateToAll} className="bg-copper text-white font-black py-4 px-8 rounded-2xl flex items-center space-x-3 text-sm transition-all active:scale-95"><RotateCcw size={18} /><span>APLICAR PADRÃO A TODOS OS DIAS</span></button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <section className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Abertura</label>
                                    <input type="time" value={standardTemplate.open} onChange={(e) => setStandardTemplate({ ...standardTemplate, open: e.target.value })} className="w-full bg-industrial-dark border border-gray-800 rounded-2xl p-4 text-white font-black focus:border-copper outline-none transition-all" />
                                </section>
                                <section className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Fechamento</label>
                                    <input type="time" value={standardTemplate.close} onChange={(e) => setStandardTemplate({ ...standardTemplate, close: e.target.value })} className="w-full bg-industrial-dark border border-gray-800 rounded-2xl p-4 text-white font-black focus:border-copper outline-none transition-all" />
                                </section>
                                <section className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Ini. Almoço</label>
                                    <input type="time" value={standardTemplate.lunchStart} onChange={(e) => setStandardTemplate({ ...standardTemplate, lunchStart: e.target.value })} className="w-full bg-industrial-dark border border-gray-800 rounded-2xl p-4 text-white font-black focus:border-copper outline-none transition-all" />
                                </section>
                                <section className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest ml-1">Fim Almoço</label>
                                    <input type="time" value={standardTemplate.lunchEnd} onChange={(e) => setStandardTemplate({ ...standardTemplate, lunchEnd: e.target.value })} className="w-full bg-industrial-dark border border-gray-800 rounded-2xl p-4 text-white font-black focus:border-copper outline-none transition-all" />
                                </section>
                            </div>
                        </div>

                        {/* WEEKLY REPEATER */}
                        <div className="bg-[#1a1a1a] rounded-[3rem] border border-gray-800 overflow-hidden shadow-2xl">
                            <div className="p-10 border-b border-gray-800 flex justify-between items-center">
                                <h3 className="text-xl font-black uppercase tracking-tighter italic">Agenda Semanal</h3>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Personalize cada dia</span>
                            </div>

                            <div className="divide-y divide-gray-800/50">
                                {Object.entries(weeklySchedule).map(([dayKey, dayData]) => (
                                    <div key={dayKey} className="p-8 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 hover:bg-white/[0.01] transition-colors">
                                        <div className="w-40 shrink-0">
                                            <h4 className="text-lg font-black uppercase tracking-tighter italic text-copper">{dayKey}</h4>
                                            <button
                                                onClick={() => handleUpdateDay(dayKey, 'active', !dayData.active)}
                                                className={`flex items-center space-x-2 mt-1 text-[10px] font-black uppercase tracking-widest ${dayData.active ? 'text-emerald-500' : 'text-red-500'}`}
                                            >
                                                <ToggleRight size={16} className={dayData.active ? '' : 'rotate-180'} />
                                                <span>{dayData.active ? 'Aberto' : 'Fechado'}</span>
                                            </button>
                                        </div>

                                        <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 transition-all ${dayData.active ? 'opacity-100' : 'opacity-20 pointer-events-none grayscale'}`}>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-gray-600 uppercase">Abertura</label>
                                                <input
                                                    type="time"
                                                    value={dayData.open}
                                                    onChange={(e) => handleUpdateDay(dayKey, 'open', e.target.value)}
                                                    className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-white font-bold"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-gray-600 uppercase">Fechamento</label>
                                                <input
                                                    type="time"
                                                    value={dayData.close}
                                                    onChange={(e) => handleUpdateDay(dayKey, 'close', e.target.value)}
                                                    className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-white font-bold"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-gray-600 uppercase">Ini. Almoço</label>
                                                <input
                                                    type="time"
                                                    value={dayData.lunchStart}
                                                    onChange={(e) => handleUpdateDay(dayKey, 'lunchStart', e.target.value)}
                                                    className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-white font-bold"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-gray-600 uppercase">Fim Almoço</label>
                                                <input
                                                    type="time"
                                                    value={dayData.lunchEnd}
                                                    onChange={(e) => handleUpdateDay(dayKey, 'lunchEnd', e.target.value)}
                                                    className="w-full bg-[#121212] border border-gray-800 rounded-xl px-4 py-3 text-white font-bold"
                                                />
                                            </div>
                                        </div>

                                        <div className="shrink-0 xl:ml-6">
                                            <button
                                                onClick={() => {
                                                    const updated = { ...weeklySchedule };
                                                    updated[dayKey] = { ...standardTemplate };
                                                    setWeeklySchedule(updated);
                                                }}
                                                className="p-3 text-gray-700 hover:text-copper transition-colors"
                                                title="Resetar para padrão"
                                            >
                                                <RotateCcw size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-8 bg-copper hover:bg-copper-light text-white font-black text-center rounded-[2.5rem] shadow-2xl transition-all active:scale-95 cursor-pointer uppercase tracking-widest text-lg">
                            SALVAR TODAS AS CONFIGURAÇÕES
                        </div>
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
