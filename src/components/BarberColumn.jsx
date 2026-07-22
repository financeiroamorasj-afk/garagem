import AppointmentCard from './AppointmentCard'

export default function BarberColumn({ professional, appointments = [], onAddAppointment }) {
    return (
        <div className="flex-shrink-0 w-80 h-full flex flex-col bg-[#1e1e1e] border-r-2 border-r-copper/50 last:border-r-0 shadow-[-5px_0_15px_-5px_rgba(0,0,0,0.5)] relative overflow-hidden group">
            {/* Texture Overlay */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-leather.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>

            {/* Header */}
            <div className="p-4 border-b-2 border-b-copper/30 bg-black/20 flex items-center justify-between backdrop-blur-sm sticky top-0 z-10">
                <h3 className="text-xl font-bold text-gold-aged uppercase tracking-wider drop-shadow-md truncate">
                    {professional.nome}
                </h3>
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
            </div>

            {/* Content Area (Slots) */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {appointments.length === 0 ? (
                    /* Empty Slot Placeholder */
                    <div className="p-4 text-center text-white/10 text-xs uppercase tracking-widest border border-dashed border-white/5 rounded mt-4">
                        Sem agendamentos
                    </div>
                ) : (
                    appointments.map(app => (
                        <AppointmentCard key={app.id} appointment={app} />
                    ))
                )}
            </div>

            {/* Footer/Actions */}
            <div className="p-3 border-t border-white/5 bg-black/20">
                <button
                    onClick={() => onAddAppointment(professional.id)}
                    className="w-full py-2 text-xs font-bold text-copper border border-copper/30 rounded hover:bg-copper/10 hover:border-copper transition-all duration-300 uppercase tracking-wide"
                >
                    + Novo Agendamento
                </button>
            </div>
        </div>
    )
}
