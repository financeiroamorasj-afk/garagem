import React, { useState } from 'react';
import { X, ShoppingBag, Calendar, Check } from 'lucide-react';
import ClientSearch from './ClientSearch';
import CurrencyInput from './ui/CurrencyInput';
import Button from './ui/Button';
import Label from './ui/Label';

const QuickActionModal = ({ isOpen, onClose, onSave, activeTab = 'encaixe' }) => {
    const [tab, setTab] = useState(activeTab);
    const [selectedClient, setSelectedClient] = useState(null);
    const [value, setValue] = useState(null);
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-surface-0/60 backdrop-blur-sm transition-opacity">
            <div className="w-full max-w-lg bg-surface-0 rounded-t-md sm:rounded-md border-t sm:border border-line shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">

                {/* Header / Tabs */}
                <div className="flex border-b border-line">
                    <button
                        onClick={() => setTab('encaixe')}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors duration-100 ease-brand ${tab === 'encaixe' ? 'text-copper border-b-2 border-copper' : 'text-steel'
                            }`}
                    >
                        <Calendar className="inline-block w-4 h-4 mr-2" />
                        NOVO ENCAIXE
                    </button>
                    <button
                        onClick={() => setTab('venda')}
                        className={`flex-1 py-4 text-sm font-semibold transition-colors duration-100 ease-brand ${tab === 'venda' ? 'text-copper border-b-2 border-copper' : 'text-steel'
                            }`}
                    >
                        <ShoppingBag className="inline-block w-4 h-4 mr-2" />
                        VENDA PRODUTO
                    </button>
                    <button onClick={onClose} className="p-4 text-steel hover:text-warm-white transition-colors duration-100 ease-brand">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    <section className="space-y-2">
                        <Label>Cliente</Label>
                        <ClientSearch onSelect={setSelectedClient} clients={[]} />
                    </section>

                    <section className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <CurrencyInput
                                id="amount"
                                label={tab === 'encaixe' ? 'Valor do Serviço' : 'Valor da Venda'}
                                value={value}
                                onValueChange={setValue}
                            />

                            <div className="flex flex-col space-y-1">
                                <Label>Observações</Label>
                                <textarea
                                    className="w-full bg-surface-2 border border-line-strong rounded-sm px-4 py-3 text-warm-white placeholder:text-steel focus:outline-none focus:border-copper transition-colors duration-100 ease-brand h-24 resize-none"
                                    placeholder={tab === 'encaixe' ? 'Ex: Corte e Barba' : 'Ex: Pomada Efeito Matte'}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Action Button */}
                    <Button
                        variant="primary"
                        size="lg"
                        className="w-full gap-2 shadow-[0_4px_20px_rgba(184,115,51,0.3)]"
                        onClick={() => onSave({ tab, selectedClient, value, description })}
                    >
                        <Check className="w-6 h-6" />
                        <span>CONFIRMAR AGORA</span>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default QuickActionModal;
