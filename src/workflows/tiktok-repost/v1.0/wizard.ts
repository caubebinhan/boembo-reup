import { WizardStepConfig } from '@renderer/wizard/WizardStepTypes'
import { WizardDetails } from '@renderer/components/wizard/WizardDetails'
import { WizardSources } from '@renderer/components/wizard/WizardSources'
import { WizardVideoEdit } from '@renderer/components/wizard/WizardVideoEdit'
import { WizardSchedule } from '@renderer/components/wizard/WizardSchedule'
import { WizardTarget } from '@renderer/components/wizard/WizardTarget'

export const tiktokRepostSteps: WizardStepConfig[] = [
  {
    id: 'details',
    title: 'Details',
    icon: '📝',
    description: 'Campaign name, type, schedule, and captions',
    component: WizardDetails,
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
    component: WizardSources,
    validate: (data) => {
      const sources = data.sources || []
      if (sources.length === 0) return 'Add at least one source (channel or keyword)'
      const hasEmpty = sources.some((s: any) => !s.name?.trim())
      if (hasEmpty) return 'All sources must have a name'
      return null
    },
  },
  {
    id: 'video-edit',
    title: 'Video Edit',
    icon: '🎬',
    description: 'Configure video editing operations',
    component: WizardVideoEdit,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: '📅',
    description: 'Preview and adjust publish schedule',
    component: WizardSchedule,
  },
  {
    id: 'target',
    title: 'Target',
    icon: '🎯',
    description: 'Select accounts to publish to',
    component: WizardTarget,
    validate: (data) => {
      const accounts = data.selectedAccounts || data.accounts || []
      if (accounts.length === 0) return 'Select at least one publish account'
      return null
    },
  },
]
