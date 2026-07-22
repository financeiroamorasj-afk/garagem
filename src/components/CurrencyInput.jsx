import React, { useState } from 'react';

/**
 * CurrencyInput Component - Follows the 'Rebip' pattern:
 * - Real-time currency masking (R$)
 * - Select all text on focus
 * - Mobile friendly (inputmode="decimal")
 */
const CurrencyInput = ({ value, onChange, label, id }) => {
    const [displayValue, setDisplayValue] = useState(formatCurrency(value || 0));

    function formatCurrency(val) {
        const number = typeof val === 'number' ? val : parseFloat(val || 0);
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(number);
    }

    const handleChange = (e) => {
        // Remove everything that isn't a digit
        let rawValue = e.target.value.replace(/\D/g, '');

        // Convert to number (cents)
        const numberValue = parseInt(rawValue || '0') / 100;

        // Update display and callback
        setDisplayValue(formatCurrency(numberValue));
        if (onChange) {
            onChange(numberValue);
        }
    };

    const handleFocus = (e) => {
        e.target.select();
    };

    return (
        <div className="flex flex-col space-y-1">
            {label && (
                <label htmlFor={id} className="text-sm font-medium text-gray-400 ml-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    value={displayValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    className="w-full bg-industrial-dark border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-copper transition-colors text-lg font-semibold shadow-inner"
                    placeholder="R$ 0,00"
                />
            </div>
        </div>
    );
};

export default CurrencyInput;
