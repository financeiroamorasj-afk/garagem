import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

/**
 * ClientSearch Component - Follows the 'Rebip' pattern:
 * - Rounded design (border-radius: 25px+)
 * - Soft shadows and elegant borders
 * - Auto-focus on mount
 * - Internal search icon
 */
const ClientSearch = ({ onSelect, clients = [] }) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const inputRef = useRef(null);

    // Auto-focus on mount
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, []);

    const filteredClients = query.trim() === ''
        ? []
        : clients.filter((client) =>
            client.nome.toLowerCase().includes(query.toLowerCase())
        );

    return (
        <div className="relative w-full">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-copper opacity-70" />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-industrial-dark border border-gray-800 text-white text-sm focus:ring-copper focus:border-copper block pl-11 pr-4 py-3 shadow-lg"
                    style={{ borderRadius: '25px' }}
                    placeholder="Buscar ou cadastrar cliente..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
            </div>

            {isOpen && query.length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-[#1a1a1a] border border-gray-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden">
                    {filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                            <button
                                key={client.id}
                                onClick={() => {
                                    onSelect(client);
                                    setQuery(client.nome);
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-5 py-3 text-gray-300 hover:bg-industrial-dark hover:text-copper transition-colors border-b border-gray-800/50 last:border-0"
                            >
                                <div className="font-medium">{client.nome}</div>
                                <div className="text-xs text-gray-500">{client.telefone || 'Sem telefone'}</div>
                            </button>
                        ))
                    ) : (
                        <button
                            onClick={() => {
                                onSelect({ nome: query, id: 'new' });
                                setIsOpen(false);
                            }}
                            className="w-full text-left px-5 py-4 text-copper hover:bg-industrial-dark transition-colors flex items-center space-x-2"
                        >
                            <span className="text-xl">+</span>
                            <span>Cadastrar novo: <strong>{query}</strong></span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClientSearch;
