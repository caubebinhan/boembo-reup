import { useState, useMemo } from 'react'
import { WizardStepper, StepDef } from './WizardStepper'
import { Step1_Details } from './wizard/Step1_Details'
import { Step2_Sources } from './wizard/Step2_Sources'
import { Step4_Schedule } from './wizard/Step4_Schedule'
import { Step5_Target } from './wizard/Step5_Target'
import { useFlowUIDescriptor, evaluateExpression } from '../hooks/useFlowUIDescriptor'

interface CampaignWizardProps {
    onClose: () => void
    flowId?: string
}

export function CampaignWizard({ onClose, flowId = 'tiktok-repost' }: CampaignWizardProps) {
    const { descriptor, loading } = useFlowUIDescriptor(flowId)

    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [stepData, setStepData] = useState<Record<string, any>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Map YAML steps to StepDef array
    const steps = useMemo(() => {
        if (!descriptor?.wizard?.steps) return []
        return descriptor.wizard.steps.map((s: any) => ({
            id: s.id,
            title: s.title,
            icon: s.icon,
            custom_component: s.custom_component,
            can_advance_expr: s.can_advance_expr
        }))
    }, [descriptor])

    const isLastStep = steps.length > 0 && currentStepIndex === steps.length - 1

    const handleNext = () => {
        const step = steps[currentStepIndex]
        if (step.can_advance_expr) {
            const canVal = evaluateExpression(step.can_advance_expr, { stepData }, true)
            if (!canVal) {
                alert('Please complete all required fields for this step before advancing.')
                return
            }
        }
        if (!isLastStep) {
            setCurrentStepIndex(prev => prev + 1)
        }
    }

    const handleBack = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1)
        } else {
            onClose()
        }
    }

    const handleSave = async () => {
        // Evaluate final step requirement if any
        const step = steps[currentStepIndex]
        if (step?.can_advance_expr) {
            if (!evaluateExpression(step.can_advance_expr, { stepData }, true)) {
                alert('Please complete all required fields.')
                return
            }
        }

        setIsSubmitting(true)
        try {
            const payload = {
                ...stepData,
                workflow_id: flowId
            }
            // @ts-ignore
            await window.api.invoke('campaign:create', payload)
            alert('Campaign created successfully!')
            onClose()
        } catch (err: any) {
            console.error(err)
            alert(`Failed to save campaign: ${err.message}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-[#1e293b] p-8 rounded-xl text-white">Loading Campaign Wizard...</div>
            </div>
        )
    }

    if (steps.length === 0) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-[#1e293b] p-8 rounded-xl text-white">
                    <p>No valid workflow steps found.</p>
                    <button className="mt-4 px-4 py-2 bg-gray-600 rounded" onClick={onClose}>Close</button>
                </div>
            </div>
        )
    }

    const currentStep = steps[currentStepIndex]

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1e293b] w-[860px] max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">

                {/* Header - Stepper */}
                <div className="border-b border-gray-800 bg-[#0f172a] shrink-0">
                    <WizardStepper steps={steps} currentIndex={currentStepIndex} />
                </div>

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-8 relative min-h-[400px]">
                    {currentStep?.custom_component === 'CampaignDetailsStep' && (
                        <Step1_Details
                            data={stepData}
                            updateData={(updates) => setStepData(prev => ({ ...prev, ...updates }))}
                        />
                    )}
                    {currentStep?.custom_component === 'SourcePickerStep' && (
                        <Step2_Sources
                            data={stepData}
                            updateData={(updates) => setStepData(prev => ({ ...prev, ...updates }))}
                        />
                    )}
                    {currentStep?.custom_component === 'VideoEditorStep' && (
                        <div className="text-gray-400 text-center mt-20">
                            [Placeholder for Step: VideoEditorStep]
                        </div>
                    )}
                    {currentStep?.custom_component === 'SchedulePreviewStep' && (
                        <Step4_Schedule
                            data={stepData}
                            updateData={(updates) => setStepData(prev => ({ ...prev, ...updates }))}
                        />
                    )}
                    {currentStep?.custom_component === 'AccountPickerStep' && (
                        <Step5_Target
                            data={stepData}
                            updateData={(updates) => setStepData(prev => ({ ...prev, ...updates }))}
                        />
                    )}
                </div>

                {/* Footer Navigation */}
                <div className="border-t border-gray-800 bg-[#0f172a] p-4 flex justify-between items-center shrink-0">
                    <button
                        onClick={handleBack}
                        className="px-6 py-2 rounded border border-gray-600 text-gray-300 hover:bg-gray-800 transition"
                    >
                        {currentStepIndex === 0 ? 'Cancel' : '← Back'}
                    </button>

                    {!isLastStep ? (
                        <button
                            onClick={handleNext}
                            className="px-6 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition"
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            disabled={isSubmitting}
                            className="px-6 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition disabled:opacity-50"
                        >
                            {isSubmitting ? 'Saving...' : '💾 Save & Schedule'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
