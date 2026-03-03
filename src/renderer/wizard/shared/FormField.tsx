

interface FormFieldProps {
    label: string
    required?: boolean
    error?: string
    hint?: string
    children: React.ReactNode
}

export function FormField({ label, required, error, hint, children }: FormFieldProps) {
    return (
        <div className="mb-5">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
            {hint && !error && (
                <p className="text-xs text-slate-400 mt-1">{hint}</p>
            )}
            {error && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
        </div>
    )
}

