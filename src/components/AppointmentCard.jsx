
export default function AppointmentCard({ appointment }) {
    // Format time (assuming hh:mm:ss or similar, simplified for now)
    const formatTime = (timeString) => {
        if (!timeString) return '--:--'
        return timeString.substring(0, 5) // Take HH:MM
    }

    return (
        <div className="bg-[#2a2a2a] p-3 rounded border-l-4 border-l-copper shadow-sm hover:translate-y-[-2px] hover:shadow-md transition-all duration-300 cursor-pointer group">
            <div className="flex justify-between items-start mb-1">
                <span className="font-bold text-copper-light text-sm truncate pr-2">
                    {appointment.cliente_nome}
                </span>
                <span className="text-xs font-mono text-white/40 bg-black/20 px-1 rounded">
                    {formatTime(appointment.horario)}
                </span>
            </div>

            <div className="text-xs text-white/60 truncate">
                {appointment.servico}
            </div>

            {/* Hover action (could be edit/delete in future) */}
            <div className="h-0 overflow-hidden group-hover:h-auto group-hover:mt-2 transition-all">
                <div className="flex justify-end pt-2 border-t border-white/5">
                    <span className="text-[10px] uppercase tracking-wider text-gold-aged opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                        Detalhes →
                    </span>
                </div>
            </div>
        </div>
    )
}
