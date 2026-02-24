import { WizardStepConfig } from '../WizardStepTypes'
import { Step1_Details } from '../../components/wizard/Step1_Details'
import { Step2_Sources } from '../../components/wizard/Step2_Sources'
import { Step4_Schedule } from '../../components/wizard/Step4_Schedule'
import { Step5_Target } from '../../components/wizard/Step5_Target'

export const tiktokRepostSteps: WizardStepConfig[] = [
  {
    id: 'details',
    title: 'Details',
    icon: '📝',
    description: 'Campaign name, type, schedule, and captions',
    component: Step1_Details,
    validate: (data) => {
      if (!data.name?.trim()) return 'Campaign name is required'
      return null
    },
  },
  {
    id: 'sources',
    title: 'Sources',
    icon: '📡',
    description: 'Configure channels and keywords to monitor',
    component: Step2_Sources,
    validate: (data) => {
      const sources = data.sources || []
      if (sources.length === 0) return 'Add at least one source (channel or keyword)'
      const hasEmpty = sources.some((s: any) => !s.name?.trim())
      if (hasEmpty) return 'All sources must have a name'
      return null
    },
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: '📅',
    description: 'Preview and adjust publish schedule',
    component: Step4_Schedule,
  },
  {
    id: 'target',
    title: 'Target',
    icon: '🎯',
    description: 'Select accounts to publish to',
    component: Step5_Target,
    validate: (data) => {
      const accounts = data.selectedAccounts || data.accounts || []
      if (accounts.length === 0) return 'Select at least one publish account'
      return null
    },
  },
]
