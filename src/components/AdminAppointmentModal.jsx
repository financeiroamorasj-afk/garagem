import React, { useState } from 'react';
import { Search, Check } from 'lucide-react';
import ClientSearch from './ClientSearch';
import CurrencyInput from './ui/CurrencyInput';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import Label from './ui/Label';

const AdminAppointmentModal = ({ isOpen, onClose, onSave, initialData = {} }) => {
    const [selectedClient, setSelectedClient] = useState(null);
    const [profissionalId] = useState(initialData.profissionalId || '');
    const [servicoId, setServicoId] = useState('');
    const [horario, setHorario] = useState(initialData.time || '09:00');
    const [value, setValue] = useState(null);

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={<span className="text-copper">Novo Agendamento</span>}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        className="gap-2"
                        onClick={() => onSave({ selectedClient, profissionalId, servicoId, horario, value })}
                    >
                        <Check size={18} strokeWidth={3} />
                        <span>AGENDAR AGORA</span>
                    </Button>
                </>
            }
        >
            <div className="space-y-6">
                <section className="space-y-2">
                    <Label>Cliente</Label>
                    <ClientSearch onSelect={setSelectedClient} clients={[]} />
                </section>

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Horário"
                        type="time"
                        value={horario}
                        onChange={(e) => setHorario(e.target.value)}
                    />

                    <CurrencyInput label="Valor do Serviço" value={value} onValueChange={setValue} />
                </div>

                <section className="space-y-2">
                    <Label>Serviço</Label>
                    <select
                        value={servicoId}
                        onChange={(e) => setServicoId(e.target.value)}
                        className="w-full bg-surface-2 border border-line-strong rounded-sm px-4 py-3 text-warm-white focus:border-copper outline-none appearance-none transition-colors duration-100 ease-brand"
                    >
                        <option value="">Selecione um serviço...</option>
                        <option value="1">Corte Social (30 min)</option>
                        <option value="2">Degradê (60 min)</option>
                        <option value="3">Barba Completa (30 min)</option>
                        <option value="4">Combo: Corte + Barba (90 min)</option>
                    </select>
                </section>
            </div>
        </Modal>
    );
};

export default AdminAppointmentModal;
