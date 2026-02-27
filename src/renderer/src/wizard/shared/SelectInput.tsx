

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
            className={`w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 
        focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 
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
