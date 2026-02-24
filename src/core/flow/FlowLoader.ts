import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import { FlowDefinition, WorkflowUIDescriptor } from './ExecutionContracts'

export class FlowLoader {
  private cache = new Map<string, FlowDefinition>()

  public loadAll(workflowsDir: string): FlowDefinition[] {
    if (!fs.existsSync(workflowsDir)) return []
    
    // Scan subdirectories: src/workflows/*/flow.yaml
    const entries = fs.readdirSync(workflowsDir, { withFileTypes: true })
    const flows: FlowDefinition[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const flowFile = path.join(workflowsDir, entry.name, 'flow.yaml')
      if (!fs.existsSync(flowFile)) continue
      try {
        const flow = this.load(flowFile)
        flows.push(flow)
      } catch (err) {
        console.error(`Error loading flow ${entry.name}/flow.yaml:`, err)
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
      throw new Error(`Invalid Flow: missing required fields. id=${raw.id}`)
    }

    const nodes = raw.nodes.map((n: any) => ({
      node_id: n.node_id,
      instance_id: n.instance_id,
      children: n.children,
      on_error: n.on_error,
    }))

    const edges = raw.edges.map((e: any) => ({
      from: e.from,
      to: e.to,
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

  private parseUI(raw: any): WorkflowUIDescriptor {
    if (!raw) return {}
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

export const flowLoader = new FlowLoader()
