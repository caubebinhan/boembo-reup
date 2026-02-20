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
                                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${isCompleted
                                        ? 'bg-green-500 text-white'
                                        : isActive
                                            ? 'border-2 border-purple-600 bg-purple-600/20 text-white'
                                            : 'border-2 border-white/20 bg-transparent text-gray-500'
                                    }`}
                            >
                                {isCompleted ? '✓' : step.icon}
                            </div>
                            <span
                                className={`text-sm mt-2 whitespace-nowrap ${isActive ? 'font-bold text-white' : 'text-gray-400'
                                    }`}
                            >
                                {step.title}
                            </span>
                        </div>

                        {/* Line connecting to next step */}
                        {index < steps.length - 1 && (
                            <div className="flex-1 mx-4 -mt-6">
                                <div
                                    className={`h-[2px] w-full transition-colors ${isCompleted ? 'bg-green-500' : 'bg-gray-700'
                                        }`}
                                />
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
