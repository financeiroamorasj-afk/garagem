
export default function AppointmentCard({ appointment }) {
    // data_hora é timestamptz (ISO completo), não "HH:MM" — precisa ser parseado.
    const formatTime = (isoString) => {
        if (!isoString) return '--:--'
        const d = new Date(isoString)
        if (Number.isNaN(d.getTime())) return '--:--'
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    // Cliente pode vir do cadastro (join em clientes) ou ser um nome avulso
    // gravado direto no agendamento.
    const nomeCliente =
        appointment.clientes?.nome || appointment.cliente_nome_manual || 'Cliente'

    const nomeServico = appointment.servicos?.nome || 'Serviço não informado'

    return (
        <div className="bg-surface-3 p-3 rounded-sm border-l-4 border-l-copper shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all duration-300 cursor-pointer group">
            <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-copper-light text-sm truncate pr-2">
                    {nomeCliente}
                </span>
                <span className="text-data text-steel bg-surface-0 px-1 rounded-sm">
                    {formatTime(appointment.data_hora)}
                </span>
            </div>

            <div className="text-body-sm text-steel truncate">
                {nomeServico}
            </div>

            {/* Hover action (could be edit/delete in future) */}
            <div className="h-0 overflow-hidden group-hover:h-auto group-hover:mt-2 transition-all">
                <div className="flex justify-end pt-2 border-t border-line">
                    <span className="text-label text-gold-aged opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                        Detalhes →
                    </span>
                </div>
            </div>
        </div>
    )
}
