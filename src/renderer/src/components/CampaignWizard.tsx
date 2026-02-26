import { useState, useEffect, useMemo } from 'react'
import { WizardStepper } from './WizardStepper'
import { getWizardSteps, workflowWizardRegistry } from '../wizard/workflowWizardRegistry'
import { WizardStepConfig } from '../wizard/WizardStepTypes'
import { FormField, TextInput } from '../wizard/shared'

interface CampaignWizardProps {
    onClose: () => void
    flowId?: string
}

interface WorkflowOption {
    id: string
    name: string
    icon?: string
    description?: string
}

/**
 * Campaign Wizard — Step 0 (name + workflow) → Per-workflow custom steps
 */
export function CampaignWizard({ onClose, flowId: initialFlowId }: CampaignWizardProps) {
    // ── State ──────────────────────────────────
    const selectedWorkflow = initialFlowId || ''
    const [campaignName, setCampaignName] = useState('')
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const [stepData, setStepData] = useState<Record<string, any>>({})
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [stepError, setStepError] = useState<string | null>(null)
    const [availableWorkflows, setAvailableWorkflows] = useState<WorkflowOption[]>([])

    // ── Load available workflows from backend ──
    useEffect(() => {
        const load = async () => {
            try {
                // @ts-ignore
                const flows = await window.api.invoke('flow:list')
                setAvailableWorkflows(
                    flows.map((f: any) => ({
                        id: f.id,
                        name: f.name,
                        icon: f.icon,
                        description: f.description,
                    }))
                )
            } catch {
                // Fallback: use registry keys
                setAvailableWorkflows(
                    Object.keys(workflowWizardRegistry).map(id => ({
                        id,
                        name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    }))
                )
            }
        }
        load()
    }, [])
    // ── Wizard steps for selected workflow (async) ─────
    const [workflowSteps, setWorkflowSteps] = useState<WizardStepConfig[]>([])
    const [stepsLoading, setStepsLoading] = useState(false)
    useEffect(() => {
        if (!selectedWorkflow) { setWorkflowSteps([]); return }
        console.log(`[Wizard] Loading steps for workflow: ${selectedWorkflow}`)
        setStepsLoading(true)
        getWizardSteps(selectedWorkflow)
            .then(steps => {
                console.log(`[Wizard] Loaded ${steps.length} steps for ${selectedWorkflow}:`, steps.map(s => s.id))
                setWorkflowSteps(steps)
            })
            .catch(err => console.error('[Wizard] Failed to load steps:', err))
            .finally(() => setStepsLoading(false))
    }, [selectedWorkflow])

    // Step 0 is "Setup" (name + workflow), then workflow-specific steps
    const isStep0 = currentStepIndex === 0
    const workflowStepIndex = currentStepIndex - 1
    const totalSteps = 1 + workflowSteps.length
    const isLastStep = currentStepIndex === totalSteps - 1

    // Build stepper display
    const stepperSteps = useMemo(() => {
        const setup = { id: 'setup', title: 'Setup', icon: '⚙️' }
        const wfSteps = workflowSteps.map(s => ({ id: s.id, title: s.title, icon: s.icon }))
        return [setup, ...wfSteps]
    }, [workflowSteps])

    // ── Handlers ───────────────────────────────
    const handleNext = () => {
        setStepError(null)

        if (isStep0) {
            if (!campaignName.trim()) {
                setStepError('Campaign name is required')
                return
            }
            if (!selectedWorkflow) {
                setStepError('Please select a workflow')
                return
            }
            if (stepsLoading || workflowSteps.length === 0) {
                setStepError('Wizard steps are still loading, please wait...')
                return
            }
            // Persist name into stepData
            setStepData(prev => ({ ...prev, name: campaignName.trim() }))
        } else {
            // Validate current workflow step
            const currentStep = workflowSteps[workflowStepIndex]
            if (currentStep?.validate) {
                const error = currentStep.validate(stepData)
                if (error) {
                    setStepError(error)
                    return
                }
            }
        }

        if (!isLastStep) {
            setCurrentStepIndex(prev => prev + 1)
        }
    }

    const handleBack = () => {
        setStepError(null)
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1)
        } else {
            onClose()
        }
    }

    const handleSave = async () => {
        setStepError(null)

        // Validate last step
        if (!isStep0) {
            const currentStep = workflowSteps[workflowStepIndex]
            if (currentStep?.validate) {
                const error = currentStep.validate(stepData)
                if (error) {
                    setStepError(error)
                    return
                }
            }
        }

        setIsSubmitting(true)
        try {
            const payload = {
                ...stepData,
                name: campaignName.trim(),
                workflow_id: selectedWorkflow,
            }
            // @ts-ignore
            await window.api.invoke('campaign:create', payload)
            onClose()
        } catch (err: any) {
            console.error(err)
            setStepError(`Failed to create campaign: ${err.message}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    // ── Step 0: Setup ──────────────────────────
    const renderStep0 = () => {
        const wf = availableWorkflows.find(w => w.id === selectedWorkflow)
        return (
            <div>
                <h2 className="text-xl font-bold text-white mb-1">Create Campaign</h2>
                <p className="text-gray-400 text-sm mb-6">Name your campaign to get started</p>

                <FormField label="Campaign Name" required>
                    <TextInput
                        value={campaignName}
                        onChange={setCampaignName}
                        placeholder="My Campaign"
                    />
                </FormField>

                <div className="mt-4 flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-300">Campaign Start Time</label>
                    <p className="text-xs text-gray-500">Campaign sẽ không chạy trước thời gian này. Để trống = chạy ngay.</p>
                    <input
                        type="datetime-local"
                        className="mt-1 bg-gray-800 border border-gray-700 focus:border-purple-600 rounded-lg p-2.5 outline-none text-white text-sm w-full max-w-xs"
                        value={stepData.firstRunAt || ''}
                        min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                        onChange={(e) => setStepData(prev => ({ ...prev, firstRunAt: e.target.value }))}
                    />
                </div>

                {wf && (
                    <div className="mt-4 p-4 rounded-lg bg-[#0f172a] border border-gray-700">
                        <div className="flex items-center gap-2 text-white mb-2">
                            <span className="text-lg">{wf.icon}</span>
                            <span className="font-medium">{wf.name}</span>
                        </div>
                        <p className="text-gray-400 text-sm">
                            {wf.description || 'Configure this workflow in the following steps.'}
                        </p>
                        <div className="mt-3 flex gap-2 flex-wrap">
                            {workflowSteps.map(s => (
                                <span key={s.id} className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300">
                                    {s.icon} {s.title}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // ── Render current workflow step ───────────
    const renderWorkflowStep = () => {
        const step = workflowSteps[workflowStepIndex]
        if (!step) {
            return (
                <div className="text-gray-400 text-center mt-20">
                    Step not found
                </div>
            )
        }
        const StepComponent = step.component
        return (
            <StepComponent
                data={stepData}
                updateData={(u) => setStepData(prev => ({ ...prev, ...u }))}
            />
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#1e293b] w-[860px] max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
                {/* Stepper */}
                <div className="border-b border-gray-800 bg-[#0f172a] shrink-0">
                    <WizardStepper steps={stepperSteps} currentIndex={currentStepIndex} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 min-h-[400px]">
                    {isStep0 ? renderStep0() : renderWorkflowStep()}

                    {/* Error banner */}
                    {stepError && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            ⚠️ {stepError}
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

                    {!isLastStep || workflowSteps.length === 0 ? (
                        <button
                            onClick={handleNext}
                            disabled={isStep0 && (!campaignName.trim() || !selectedWorkflow)}
                            className="px-6 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition disabled:opacity-50"
                        >
                            Next →
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            disabled={isSubmitting}
                            className="px-6 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium transition disabled:opacity-50"
                        >
                            {isSubmitting ? 'Saving…' : '💾 Create Campaign'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
