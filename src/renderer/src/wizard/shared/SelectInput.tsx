

interface SelectOption {
    value: string
    label: string
    icon?: string
    description?: string
}

interface SelectInputProps {
    value: string
    onChange: (value: string) => void
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    className?: string
}

export function SelectInput({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    disabled,
    className = '',
}: SelectInputProps) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className={`w-full px-4 py-2.5 rounded-lg bg-[#0f172a] border border-gray-700 text-white 
        focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 
        transition disabled:opacity-50 appearance-none cursor-pointer ${className}`}
        >
            <option value="" disabled>{placeholder}</option>
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>
                    {opt.icon ? `${opt.icon} ` : ''}{opt.label}
                </option>
            ))}
        </select>
    )
}
