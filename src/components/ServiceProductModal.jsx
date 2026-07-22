import React, { useState, useEffect } from 'react';
import { X, Check, Tag, Package } from 'lucide-react';
import CurrencyInput from './CurrencyInput';

const ServiceProductModal = ({ isOpen, onClose, onSave, type = 'service', initialData = null }) => {
    const [name, setName] = useState('');
    const [duration, setDuration] = useState(30);
    const [value, setValue] = useState(0);
    const [cost, setCost] = useState(0);
    const [description, setDescription] = useState('');

    // Reset state when initialData changes or modal opens
    useEffect(() => {
        if (isOpen) {
            setName(initialData?.name || '');
            setDuration(initialData?.duration || 30);
            setValue(initialData?.value || 0);
            setCost(initialData?.cost || 0);
            setDescription(initialData?.description || '');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-lg bg-[#161616] rounded-[2.5rem] border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-gray-800/50">
                    <div className="flex items-center space-x-3">
                        <div className="bg-copper/10 p-2 rounded-lg text-copper">
                            {type === 'service' ? <Tag size={20} /> : <Package size={20} />}
                        </div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                            {initialData ? 'Editar' : 'Cadastrar'} {type === 'service' ? 'Serviço' : 'Produto'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-10 space-y-8">
                    {/* Nome Input - Rebip Pattern */}
                    <section className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-4">Nome do {type === 'service' ? 'Serviço' : 'Produto'}</label>
                        <input
                            autoFocus
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-industrial-dark border border-gray-800 rounded-full px-8 py-4 text-white focus:border-copper outline-none transition-all placeholder-gray-700"
                            placeholder={type === 'service' ? "Ex: Corte Degradê" : "Ex: Pomada Matte"}
                        />
                    </section>

                    <div className={`grid grid-cols-1 ${type === 'product' || type === 'service' ? 'md:grid-cols-2' : ''} gap-6`}>
                        {type === 'product' && (
                            <section className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-4">Custo de Compra (R$)</label>
                                <CurrencyInput
                                    value={cost}
                                    onChange={setCost}
                                />
                            </section>
                        )}
                        {type === 'service' && (
                            <section className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-4">Tempo Estimado (min)</label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        value={duration}
                                        onChange={(e) => setDuration(Number(e.target.value))}
                                        className="w-full bg-industrial-dark border border-gray-800 rounded-full px-8 py-4 text-white focus:border-copper outline-none transition-all placeholder-gray-700"
                                        placeholder="Ex: 30"
                                    />
                                    <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-700 uppercase tracking-widest pointer-events-none">Minutos</span>
                                </div>
                            </section>
                        )}
                        <section className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-4">{type === 'product' ? 'Preço de Venda' : 'Valor'} (R$)</label>
                            <CurrencyInput
                                value={value}
                                onChange={setValue}
                            />
                        </section>
                    </div>

                    <section className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-4">Descrição Curta</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-industrial-dark border border-gray-800 rounded-3xl px-8 py-4 text-white focus:border-copper outline-none transition-all resize-none h-24 placeholder-gray-700"
                            placeholder="Breve detalhamento..."
                        />
                    </section>

                    {/* Action Button */}
                    <button
                        onClick={() => onSave({ name, value, cost, duration, description })}
                        className="w-full bg-copper hover:bg-copper-light text-white font-black py-5 rounded-full shadow-[0_12px_40px_rgba(184,115,51,0.3)] transition-all active:scale-[0.98] flex items-center justify-center space-x-2 text-lg mt-4"
                    >
                        <Check size={28} strokeWidth={3} />
                        <span>{initialData ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR CADASTRO'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ServiceProductModal;
