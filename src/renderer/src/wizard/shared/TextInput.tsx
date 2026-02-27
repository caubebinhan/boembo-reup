

interface TextInputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    maxLength?: number
    multiline?: boolean
    rows?: number
    className?: string
}

export function TextInput({
    value,
    onChange,
    placeholder,
    disabled,
    maxLength,
    multiline,
    rows = 3,
    className = '',
}: TextInputProps) {
    const baseClasses = `w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 
    placeholder-slate-300 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 
    transition disabled:opacity-50 ${className}`

    if (multiline) {
        return (
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                maxLength={maxLength}
                rows={rows}
                className={`${baseClasses} resize-none`}
            />
        )
    }

    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            className={baseClasses}
        />
    )
}
