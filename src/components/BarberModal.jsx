import React, { useState, useEffect } from 'react';
import { Check, User, MapPin, Phone, UserCircle } from 'lucide-react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import Label from './ui/Label';

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

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={
                <span className="flex items-center gap-3">
                    <span className="inline-flex bg-copper/10 p-2 rounded-sm text-copper">
                        <User size={20} />
                    </span>
                    <span>{initialData ? 'Editar Profissional' : 'Novo Barbeiro'}</span>
                </span>
            }
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" className="gap-2" onClick={() => onSave(formData)}>
                        <Check size={18} strokeWidth={3} />
                        <span>{initialData ? 'SALVAR ALTERAÇÕES' : 'CONFIRMAR PROFISSIONAL'}</span>
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                <Input
                    label="Nome Completo"
                    icon={UserCircle}
                    type="text"
                    value={formData.nome}
                    onChange={(e) => handleChange('nome', e.target.value)}
                    placeholder="Nome social completo"
                />

                <Input
                    label="Apelido (Como os clientes chamam)"
                    icon={Check}
                    type="text"
                    value={formData.apelido}
                    onChange={(e) => handleChange('apelido', e.target.value)}
                    placeholder="Ex: Dener, Vini"
                />

                <Input
                    label="Telefone / WhatsApp"
                    icon={Phone}
                    type="tel"
                    value={formData.telefone}
                    onChange={(e) => handleChange('telefone', e.target.value)}
                    placeholder="(00) 00000-0000"
                />

                <section className="space-y-2">
                    <Label>Endereço Residencial</Label>
                    <div className="relative group">
                        <div className="absolute left-3 top-3 text-steel group-focus-within:text-copper transition-colors duration-100 ease-brand">
                            <MapPin size={16} />
                        </div>
                        <textarea
                            value={formData.endereco}
                            onChange={(e) => handleChange('endereco', e.target.value)}
                            className="w-full bg-surface-2 border border-line-strong rounded-sm pl-9 pr-3 py-3 text-warm-white placeholder:text-steel focus:outline-none focus:border-copper transition-colors duration-100 ease-brand resize-none h-24"
                            placeholder="Rua, Número, Bairro, Cidade..."
                        />
                    </div>
                </section>
            </div>
        </Modal>
    );
};

export default BarberModal;
