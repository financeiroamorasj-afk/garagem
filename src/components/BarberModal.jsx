import React, { useState, useEffect } from 'react';
import { X, Check, User, MapPin, Phone, UserCircle } from 'lucide-react';

const BarberModal = ({ isOpen, onClose, onSave, initialData = null }) => {
    const [formData, setFormData] = useState({
        nome: '',
        apelido: '',
        telefone: '',
        endereco: ''
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                nome: initialData?.nome || '',
                apelido: initialData?.apelido || '',
                telefone: initialData?.telefone || '',
                endereco: initialData?.endereco || ''
            });
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-lg bg-[#161616] rounded-[2.5rem] border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-gray-800/50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-copper/10 p-2 rounded-lg text-copper">
                            <User size={20} />
                        </div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                            {initialData ? 'Editar Profissional' : 'Novo Barbeiro'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-10 space-y-6">
                    <section className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-4">Nome Completo</label>
                        <div className="relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-700 group-focus-within:text-copper transition-colors">
                                <UserCircle size={18} />
                            </div>
                            <input
                                autoFocus
                                type="text"
                                value={formData.nome}
                                onChange={(e) => handleChange('nome', e.target.value)}
                                className="w-full bg-industrial-dark border border-gray-800 rounded-full pl-14 pr-8 py-4 text-white focus:border-copper outline-none transition-all placeholder-gray-700"
                                placeholder="Nome social completo"
                            />
                        </div>
                    </section>

                    <section className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-4">Apelido (Como os clientes chamam)</label>
                        <div className="relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-700 group-focus-within:text-copper transition-colors">
                                <Check size={18} />
                            </div>
                            <input
                                type="text"
                                value={formData.apelido}
                                onChange={(e) => handleChange('apelido', e.target.value)}
                                className="w-full bg-industrial-dark border border-gray-800 rounded-full pl-14 pr-8 py-4 text-white focus:border-copper outline-none transition-all placeholder-gray-700"
                                placeholder="Ex: Dener, Vini"
                            />
                        </div>
                    </section>

                    <section className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-4">Telefone / WhatsApp</label>
                        <div className="relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-700 group-focus-within:text-copper transition-colors">
                                <Phone size={18} />
                            </div>
                            <input
                                type="tel"
                                value={formData.telefone}
                                onChange={(e) => handleChange('telefone', e.target.value)}
                                className="w-full bg-industrial-dark border border-gray-800 rounded-full pl-14 pr-8 py-4 text-white focus:border-copper outline-none transition-all placeholder-gray-700"
                                placeholder="(00) 00000-0000"
                            />
                        </div>
                    </section>

                    <section className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-4">Endereço Residencial</label>
                        <div className="relative group">
                            <div className="absolute left-6 top-6 text-gray-700 group-focus-within:text-copper transition-colors">
                                <MapPin size={18} />
                            </div>
                            <textarea
                                value={formData.endereco}
                                onChange={(e) => handleChange('endereco', e.target.value)}
                                className="w-full bg-industrial-dark border border-gray-800 rounded-3xl pl-14 pr-8 py-4 text-white focus:border-copper outline-none transition-all resize-none h-24 placeholder-gray-700"
                                placeholder="Rua, Número, Bairro, Cidade..."
                            />
                        </div>
                    </section>

                    {/* Action Button */}
                    <button
                        onClick={() => onSave(formData)}
                        className="w-full bg-copper hover:bg-copper-light text-white font-black py-5 rounded-full shadow-[0_12px_40px_rgba(184,115,51,0.3)] transition-all active:scale-[0.98] flex items-center justify-center space-x-2 text-lg mt-4"
                    >
                        <Check size={28} strokeWidth={3} />
                        <span>{initialData ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR PROFISSIONAL'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BarberModal;
