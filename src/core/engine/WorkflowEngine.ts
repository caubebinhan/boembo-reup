import { WorkflowConfig } from '../types/WorkflowConfig'
import { z } from 'zod'

// Simple zod schema for validation
const NodeConfigSchema: z.ZodType<any> = z.lazy(() => z.object({
  id: z.string(),
  node: z.string(),
  params: z.record(z.any()).default({}),
  condition: z.string().optional(),
  on_success: z.string().optional(),
  on_empty: z.object({ action: z.string() }).optional(),
  body: z.array(NodeConfigSchema).optional()
}))

export const WorkflowConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  pipeline: z.array(NodeConfigSchema)
})

import yaml from 'js-yaml'

export class WorkflowEngine {
  static loadFromYaml(yamlStr: string): WorkflowConfig {
    const parsed = yaml.load(yamlStr)
    return WorkflowConfigSchema.parse(parsed) as WorkflowConfig
  }

  static validate(config: any): WorkflowConfig {
    return WorkflowConfigSchema.parse(config)
  }
}

