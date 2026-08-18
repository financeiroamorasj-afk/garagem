
export default function AppointmentCard({ appointment }) {
    // Format time (assuming hh:mm:ss or similar, simplified for now)
    const formatTime = (timeString) => {
        if (!timeString) return '--:--'
        return timeString.substring(0, 5) // Take HH:MM
    }

    return (
        <div className="bg-surface-3 p-3 rounded-sm border-l-4 border-l-copper shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all duration-300 cursor-pointer group">
            <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-copper-light text-sm truncate pr-2">
                    {appointment.cliente_nome}
                </span>
                <span className="text-data text-steel bg-surface-0 px-1 rounded-sm">
                    {formatTime(appointment.horario)}
                </span>
            </div>

            <div className="text-body-sm text-steel truncate">
                {appointment.servico}
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
