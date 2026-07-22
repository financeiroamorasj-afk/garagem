import React, { useState } from 'react';
import { X, ShoppingBag, Calendar, Check } from 'lucide-react';
import ClientSearch from './ClientSearch';
import CurrencyInput from './CurrencyInput';

const QuickActionModal = ({ isOpen, onClose, onSave, activeTab = 'encaixe' }) => {
    const [tab, setTab] = useState(activeTab);
    const [selectedClient, setSelectedClient] = useState(null);
    const [value, setValue] = useState(0);
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-opacity">
            <div className="w-full max-w-lg bg-industrial-dark rounded-t-3xl sm:rounded-3xl border-t sm:border border-gray-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">

                {/* Header / Tabs */}
                <div className="flex border-b border-gray-800">
                    <button
                        onClick={() => setTab('encaixe')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${tab === 'encaixe' ? 'text-copper border-b-2 border-copper' : 'text-gray-500'
                            }`}
                    >
                        <Calendar className="inline-block w-4 h-4 mr-2" />
                        NOVO ENCAIXE
                    </button>
                    <button
                        onClick={() => setTab('venda')}
                        className={`flex-1 py-4 text-sm font-bold transition-colors ${tab === 'venda' ? 'text-copper border-b-2 border-copper' : 'text-gray-500'
                            }`}
                    >
                        <ShoppingBag className="inline-block w-4 h-4 mr-2" />
                        VENDA PRODUTO
                    </button>
                    <button onClick={onClose} className="p-4 text-gray-500 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <section className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Cliente</label>
                        <ClientSearch onSelect={setSelectedClient} clients={[]} />
                    </section>

                    <section className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <CurrencyInput
                                id="amount"
                                label={tab === 'encaixe' ? 'Valor do Serviço' : 'Valor da Venda'}
                                value={value}
                                onChange={setValue}
                            />

                            <div className="flex flex-col space-y-1">
                                <label className="text-sm font-medium text-gray-400 ml-1">Observações</label>
                                <textarea
                                    className="w-full bg-industrial-dark border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-copper transition-colors h-24 resize-none"
                                    placeholder={tab === 'encaixe' ? 'Ex: Corte e Barba' : 'Ex: Pomada Efeito Matte'}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Action Button */}
                    <button
                        onClick={() => onSave({ tab, selectedClient, value, description })}
                        className="w-full bg-copper hover:bg-copper-light text-white font-black py-4 rounded-xl shadow-[0_4px_20px_rgba(184,115,51,0.3)] transition-all active:scale-[0.98] flex items-center justify-center space-x-2 text-lg"
                    >
                        <Check className="w-6 h-6" />
                        <span>CONFIRMAR AGORA</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickActionModal;
