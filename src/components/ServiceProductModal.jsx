import React, { useState, useEffect } from 'react';
import { Check, Tag, Package } from 'lucide-react';
import CurrencyInput from './ui/CurrencyInput';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import Label from './ui/Label';

const ServiceProductModal = ({ isOpen, onClose, onSave, type = 'service', initialData = null }) => {
    const [name, setName] = useState('');
    const [duration, setDuration] = useState(30);
    const [value, setValue] = useState(null);
    const [cost, setCost] = useState(null);
    const [description, setDescription] = useState('');

    // Reset state when initialData changes or modal opens
    useEffect(() => {
        if (isOpen) {
            // O modal reutilizado precisa reidratar o rascunho ao trocar o cadastro selecionado.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setName(initialData?.name || '');
            setDuration(initialData?.duration || 30);
            setValue(initialData?.value || 0);
            setCost(initialData?.cost || 0);
            setDescription(initialData?.description || '');
        }
    }, [isOpen, initialData]);

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={
                <span className="flex items-center gap-3">
                    <span className="inline-flex bg-copper/10 p-2 rounded-sm text-copper">
                        {type === 'service' ? <Tag size={20} /> : <Package size={20} />}
                    </span>
                    <span>{initialData ? 'Editar' : 'Cadastrar'} {type === 'service' ? 'Serviço' : 'Produto'}</span>
                </span>
            }
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        className="gap-2"
                        onClick={() => onSave({ name, value, cost, duration, description })}
                    >
                        <Check size={18} strokeWidth={3} />
                        <span>{initialData ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR CADASTRO'}</span>
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                <Input
                    label={`Nome do ${type === 'service' ? 'Serviço' : 'Produto'}`}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === 'service' ? "Ex: Corte Degradê" : "Ex: Pomada Matte"}
                />

                <div className={`grid grid-cols-1 ${type === 'product' || type === 'service' ? 'md:grid-cols-2' : ''} gap-6`}>
                    {type === 'product' && (
                        <CurrencyInput label="Custo de Compra" value={cost} onValueChange={setCost} />
                    )}
                    {type === 'service' && (
                        <section className="space-y-2">
                            <Label>Tempo Estimado (min)</Label>
                            <div className="relative group">
                                <input
                                    type="number"
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                    className="w-full bg-surface-2 border border-line-strong rounded-sm px-4 py-3 text-warm-white placeholder:text-steel focus:outline-none focus:border-copper transition-colors duration-100 ease-brand"
                                    placeholder="Ex: 30"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-label text-steel pointer-events-none">Minutos</span>
                            </div>
                        </section>
                    )}
                    <CurrencyInput label={type === 'product' ? 'Preço de Venda' : 'Valor'} value={value} onValueChange={setValue} />
                </div>

                <section className="space-y-2">
                    <Label>Descrição Curta</Label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-surface-2 border border-line-strong rounded-sm px-4 py-3 text-warm-white placeholder:text-steel focus:outline-none focus:border-copper transition-colors duration-100 ease-brand resize-none h-24"
                        placeholder="Breve detalhamento..."
                    />
                </section>
            </div>
        </Modal>
    );
};

export default ServiceProductModal;
