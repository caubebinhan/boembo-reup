

interface NumberInputProps {
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function NumberInput({
    value,
    onChange,
    min,
    max,
    step = 1,
    placeholder,
    disabled,
    className = '',
}: NumberInputProps) {
    return (
        <input
            type="number"
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full px-4 py-2.5 rounded-lg bg-[#0f172a] border border-gray-700 text-white 
        placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 
        transition disabled:opacity-50 ${className}`}
        />
    )
}
