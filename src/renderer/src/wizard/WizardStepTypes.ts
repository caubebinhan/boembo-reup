import React from 'react'

/** Props for all wizard step components */
export interface WizardStepProps {
  data: Record<string, any>
  updateData: (updates: Record<string, any>) => void
}

/** Configuration for a single wizard step */
export interface WizardStepConfig {
  id: string
  title: string
  icon: string
  description?: string
  component: React.FC<WizardStepProps>
  /** Return error message string if invalid, or null if valid */
  validate?: (data: Record<string, any>) => string | null
}
