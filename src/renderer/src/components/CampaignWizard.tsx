import { useState, useMemo } from 'react'
import { WizardStepper } from './WizardStepper'
import { Step1_Details } from './wizard/Step1_Details'
import { Step2_Sources } from './wizard/Step2_Sources'
import { Step4_Schedule } from './wizard/Step4_Schedule'
import { Step5_Target } from './wizard/Step5_Target'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'

interface CampaignWizardProps {
    onClose: () => void
    flowId?: string
}

/** Maps YAML custom_component names → React components */
const STEP_COMPONENTS: Record<string, React.FC<{ data: Record<string, any>, updateData: (u: Record<string, any>) => void }>> = {
    CampaignDetailsStep: Step1_Details,
    SourcePickerStep: Step2_Sources,
    SchedulePreviewStep: Step4_Schedule,
    AccountPickerStep: Step5_Target,
}

export function CampaignWizard({ onClose, flowId = 'tiktok-repost' }: CampaignWizardProps) {
    const { descriptor, loading } = useFlowUIDescriptor(flowId)

    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [stepData, setStepData] = useState<Record<string, any>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    const steps = useMemo(() => {
        if (!descriptor?.wizard?.steps) return []
        return descriptor.wizard.steps.map((s: any) => ({
            id: s.id,
            title: s.title,
            icon: s.icon,
            custom_component: s.custom_component,
            can_advance_expr: s.can_advance_expr,
        }))
    }, [descriptor])

    const isLastStep = steps.length > 0 && currentStepIndex === steps.length - 1

    const handleNext = () => {
        const step = steps[currentStepIndex]
        if (step?.can_advance_expr) {
            if (!evaluateExpression(step.can_advance_expr, { stepData }, true)) {
                alert('Please complete all required fields before advancing.')
                return
            }
        }
        if (!isLastStep) setCurrentStepIndex(prev => prev + 1)
    }

    const handleBack = () => {
        if (currentStepIndex > 0) setCurrentStepIndex(prev => prev - 1)
        else onClose()
    }

    const handleSave = async () => {
        setIsSubmitting(true)
        try {
            const payload = { ...stepData, workflow_id: flowId }
            // @ts-ignore
            await window.api.invoke('campaign:create', payload)
            onClose()
        } catch (err: any) {
            console.error(err)
            alert(`Failed: ${err.message}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-[#1e293b] p-8 rounded-xl text-white animate-pulse">Loading…</div>
            </div>
        )
    }

    if (steps.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-[#1e293b] p-8 rounded-xl text-white">
                    <p>No wizard steps found for this workflow.</p>
                    <button className="mt-4 px-4 py-2 bg-gray-600 rounded" onClick={onClose}>Close</button>
                </div>
            </div>
        )
    }

    const currentStep = steps[currentStepIndex]
    const StepComponent = STEP_COMPONENTS[currentStep.custom_component]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1e293b] w-[860px] max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                {/* Stepper */}
                <div className="border-b border-gray-800 bg-[#0f172a] shrink-0">
                    <WizardStepper steps={steps} currentIndex={currentStepIndex} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 min-h-[400px]">
                    {StepComponent ? (
                        <StepComponent
                            data={stepData}
                            updateData={(u) => setStepData(prev => ({ ...prev, ...u }))}
                        />
                    ) : (
                        <div className="text-gray-400 text-center mt-20">
                            Step component "{currentStep.custom_component}" not found
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-800 bg-[#0f172a] p-4 flex justify-between items-center shrink-0">
                    <button
                        onClick={handleBack}
                        className="px-6 py-2 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
                    >
                        {currentStepIndex === 0 ? 'Cancel' : '← Back'}
                    </button>

                    {!isLastStep ? (
                        <button onClick={handleNext} className="px-6 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition">
                            Next →
                        </button>
                    ) : (
                        <button onClick={handleSave} disabled={isSubmitting} className="px-6 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition disabled:opacity-50">
                            {isSubmitting ? 'Saving…' : '💾 Create Campaign'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
