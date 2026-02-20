import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import {
  FlowDefinition,
  NodeExecution,
  WorkflowUIDescriptor
} from './ExecutionContracts'

export class FlowLoader {
  private cache = new Map<string, FlowDefinition>()

  public loadAll(presetsDir: string): FlowDefinition[] {
    if (!fs.existsSync(presetsDir)) return []
    
    const files = fs.readdirSync(presetsDir).filter(f => f.endsWith('.flow.yaml'))
    const flows: FlowDefinition[] = []

    for (const file of files) {
      const filePath = path.join(presetsDir, file)
      try {
        const flow = this.load(filePath)
        flows.push(flow)
      } catch (err) {
        console.error(`Error loading flow ${file}:`, err)
      }
    }
    return flows
  }

  public load(filePath: string): FlowDefinition {
    const content = fs.readFileSync(filePath, 'utf-8')
    const raw = yaml.load(content) as any
    const flow = this.parseRaw(raw)
    this.cache.set(flow.id, flow)
    return flow
  }

  public get(flowId: string): FlowDefinition | null {
    return this.cache.get(flowId) ?? null
  }

  public getAll(): FlowDefinition[] {
    return Array.from(this.cache.values())
  }

  private parseRaw(raw: any): FlowDefinition {
    if (!raw.id || !raw.name || !raw.nodes || !raw.edges) {
      console.log('raw:', raw)
      throw new Error(`Invalid Flow definition: missing required fields. id=${raw.id}`)
    }

    const nodes = raw.nodes.map((n: any) => ({
      node_id: n.node_id,
      instance_id: n.instance_id,
      config: n.config || {},
      execution: this.parseExecution(n.execution),
      position: n.position
    }))

    const edges = raw.edges.map((e: any) => ({
      from_instance: e.from,
      to_instance: e.to
    }))

    const ui = raw.ui ? this.parseUI(raw.ui) : undefined

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      icon: raw.icon,
      color: raw.color,
      version: raw.version || '1.0',
      nodes,
      edges,
      ui
    }
  }

  private parseExecution(raw: any): NodeExecution {
    if (!raw || !raw.strategy) return { strategy: 'inline' }

    if (raw.strategy === 'inline') {
      return { strategy: 'inline' }
    }

    if (raw.strategy === 'scheduled_recurring') {
      return {
        strategy: 'scheduled_recurring',
        job_type: raw.job_type,
        initial_trigger: raw.initial_trigger || 'campaign_start',
        repeat_after: raw.repeat_after,
        stop_repeat_if: raw.stop_repeat_if,
        on_resume: raw.on_resume || 'reschedule_from_now'
      }
    }

    if (raw.strategy === 'per_item_job') {
      return {
        strategy: 'per_item_job',
        job_type: raw.job_type || 'FLOW_STEP',
        gap_between_items: raw.gap_between_items,
        respect_daily_window: raw.respect_daily_window ?? true,
        depends_on: raw.depends_on,
        retry: raw.retry || { max: 3, backoff: 'exponential', base_delay_ms: 5000 },
        create_downstream_job: raw.create_downstream_job || 'immediately_after'
      }
    }

    // Default fallback
    return { strategy: 'inline' }
  }

  private parseUI(raw: any): WorkflowUIDescriptor {
    if (!raw) return {}
    // Deep clone JSON stringify to strip potential YAML class references
    const ui = JSON.parse(JSON.stringify(raw))
    return this.stripYamlMultilineStrings(ui)
  }

  private stripYamlMultilineStrings(obj: any): any {
    if (typeof obj === 'string') {
      return obj.trim().replace(/\n\s+/g, ' ')
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.stripYamlMultilineStrings(item))
    }
    if (obj !== null && typeof obj === 'object') {
      const result: any = {}
      for (const key of Object.keys(obj)) {
        result[key] = this.stripYamlMultilineStrings(obj[key])
      }
      return result
    }
    return obj
  }
}

// Global Singleton for easy access
export const flowLoader = new FlowLoader()
