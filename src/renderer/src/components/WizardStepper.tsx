export interface StepDef {
    id: string
    title: string
    icon: string
}

interface WizardStepperProps {
    steps: StepDef[]
    currentIndex: number
}

export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
    return (
        <div className="flex items-center justify-between px-8 py-6 w-full">
            {steps.map((step, index) => {
                const isCompleted = index < currentIndex
                const isActive = index === currentIndex

                return (
                    <div key={step.id} className="flex items-center flex-1 last:flex-none">
                        {/* Circle + Label */}
                        <div className="flex flex-col items-center relative z-10 min-w-[60px]">
                            <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${isCompleted
                                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                                    : isActive
                                        ? 'border-2 border-purple-500 bg-purple-50 text-purple-600 shadow-lg shadow-purple-100 animate-glow-pulse'
                                        : 'border-2 border-slate-200 bg-white text-slate-400'
                                    }`}
                            >
                                {isCompleted ? (
                                    <span className="animate-scale-check inline-block">✓</span>
                                ) : step.icon}
                            </div>
                            <span
                                className={`text-sm mt-2 whitespace-nowrap transition-colors ${isActive
                                    ? 'font-bold text-purple-700'
                                    : isCompleted
                                        ? 'font-medium text-emerald-600'
                                        : 'text-slate-400'
                                    }`}
                            >
                                {step.title}
                            </span>
                        </div>

                        {/* Animated progress line */}
                        {index < steps.length - 1 && (
                            <div className="flex-1 mx-4 -mt-6">
                                <div className="h-[3px] w-full bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500 ease-out"
                                        style={{
                                            width: isCompleted ? '100%' : isActive ? '50%' : '0%',
                                            background: isCompleted
                                                ? '#10b981'
                                                : 'linear-gradient(90deg, #10b981, #7c3aed)',
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
