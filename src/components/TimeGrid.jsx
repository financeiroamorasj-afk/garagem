const TIME_SLOTS = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'
];

const SLOT_HEIGHT = 80; // pixels per 30 min block

const TimeGrid = ({ professionals = [], appointments = [], onSlotClick }) => {

    const getMinutesSinceStart = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return (hours * 60) + minutes - (8 * 60); // Starting at 08:00
    };

    const getCardStyle = (time, durationMinutes) => {
        const top = (getMinutesSinceStart(time) / 30) * SLOT_HEIGHT;
        const height = (durationMinutes / 30) * SLOT_HEIGHT;
        return { top: `${top}px`, height: `${height - 4}px` }; // -4 for spacing
    };

    return (
        <div className="flex-1 flex flex-col bg-surface-1 overflow-hidden">
            {/* Professionals Header */}
            <div className="flex border-b border-line bg-surface-2 sticky top-0 z-20">
                <div className="w-20 border-r border-line flex items-center justify-center text-label text-steel">Hora</div>
                {professionals.map(pro => (
                    <div key={pro.id} className="flex-1 py-4 text-center border-r border-line flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-copper/20 border border-copper/40 flex items-center justify-center text-copper font-black mb-1">
                            {pro.nome.charAt(0)}
                        </div>
                        <span className="text-label text-warm-white">{pro.nome}</span>
                    </div>
                ))}
            </div>

            {/* Grid Content */}
            <div className="flex-1 overflow-y-auto relative scrollbar-hide">
                <div className="flex min-h-full">
                    {/* Time Labels Column */}
                    <div className="w-20 border-r border-line bg-surface-2/50">
                        {TIME_SLOTS.map(slot => (
                            <div key={slot} className="h-20 flex items-start justify-center pt-2 text-label text-steel border-b border-line">
                                {slot}
                            </div>
                        ))}
                    </div>

                    {/* Professionals Columns */}
                    {professionals.map(pro => (
                        <div key={pro.id} className="flex-1 relative border-r border-line group">
                            {/* Vertical Time Slots Background */}
                            {TIME_SLOTS.map(slot => (
                                <div
                                    key={slot}
                                    className="h-20 border-b border-line hover:bg-warm-white/5 cursor-pointer transition-colors duration-100 ease-brand"
                                    onClick={() => onSlotClick(pro.id, slot)}
                                />
                            ))}

                            {/* Appointments Overlay */}
                            {appointments
                                .filter(app => app.profissional_id === pro.id)
                                .map(app => (
                                    <div
                                        key={app.id}
                                        className={`absolute left-1 right-1 z-10 p-3 rounded-sm border flex flex-col justify-between shadow-2xl transition-all hover:scale-[1.02] cursor-pointer ${app.status === 'in_progress'
                                                ? 'bg-copper border-copper-light text-surface-0 ring-4 ring-copper/20'
                                                : 'bg-surface-2 border-line-strong text-warm-white'
                                            }`}
                                        style={getCardStyle(app.horario, app.duracao || 30)}
                                    >
                                        <div>
                                            <div className="text-label opacity-60">{app.horario}</div>
                                            <div className="text-body-sm font-semibold uppercase leading-tight mt-1">{app.cliente}</div>
                                        </div>
                                        <div className="text-label opacity-80">{app.servico}</div>
                                    </div>
                                ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TimeGrid;
