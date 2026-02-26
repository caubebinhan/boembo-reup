import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import { FlowDefinition, WorkflowUIDescriptor } from './ExecutionContracts'

export class FlowLoader {
  private cache = new Map<string, FlowDefinition>()
  /** workflowId → { version → absolute dir path } */
  private versionDirs = new Map<string, Map<string, string>>()

  private parseTimeout(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0) return undefined
    return parsed
  }

  /**
   * Scan src/workflows/\*\/v*\/flow.yaml
   * For each workflow, pick the latest version and cache it.
   */
  public loadAll(workflowsDir: string): FlowDefinition[] {
    if (!fs.existsSync(workflowsDir)) return []

    const entries = fs.readdirSync(workflowsDir, { withFileTypes: true })
    const flows: FlowDefinition[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const workflowDir = path.join(workflowsDir, entry.name)

      // Discover version folders (v1.0, v2.0, etc.)
      const versionFolders = this.discoverVersionFolders(workflowDir)
      if (versionFolders.length === 0) continue

      // Store all version paths
      const verMap = new Map<string, string>()
      for (const vf of versionFolders) verMap.set(vf.version, vf.dir)
      this.versionDirs.set(entry.name, verMap)

      // Load the latest version
      const latest = versionFolders[versionFolders.length - 1]
      const flowFile = path.join(latest.dir, 'flow.yaml')
      try {
        const flow = this.load(flowFile)
        flows.push(flow)
        console.log(`[FlowLoader] ${entry.name} v${latest.version} loaded`)
      } catch (err) {
        console.error(`Error loading flow ${entry.name}/v${latest.version}/flow.yaml:`, err)
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

  /**
   * Resolve the absolute directory for a specific workflow+version.
   * Used by runtime to load version-specific code (events, recovery, etc.)
   */
  public getVersionDir(workflowId: string, version?: string): string | null {
    const verMap = this.versionDirs.get(workflowId)
    if (!verMap || verMap.size === 0) return null
    if (version) {
      // Try exact match, then normalized (strip leading 'v')
      const normalized = version.replace(/^v/i, '')
      return verMap.get(normalized) || verMap.get(version) || null
    }
    // Default: latest version
    const sorted = [...verMap.keys()].sort(this.compareVersions)
    return verMap.get(sorted[sorted.length - 1]) || null
  }

  /** Get latest version string for a workflow */
  public getLatestVersion(workflowId: string): string | null {
    const verMap = this.versionDirs.get(workflowId)
    if (!verMap || verMap.size === 0) return null
    const sorted = [...verMap.keys()].sort(this.compareVersions)
    return sorted[sorted.length - 1] || null
  }

  private discoverVersionFolders(workflowDir: string): { version: string; dir: string }[] {
    try {
      const entries = fs.readdirSync(workflowDir, { withFileTypes: true })
      const versions: { version: string; dir: string }[] = []
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const match = e.name.match(/^v(.+)$/)
        if (!match) continue
        const vDir = path.join(workflowDir, e.name)
        if (fs.existsSync(path.join(vDir, 'flow.yaml'))) {
          versions.push({ version: match[1], dir: vDir })
        }
      }
      return versions.sort((a, b) => this.compareVersions(a.version, b.version))
    } catch {
      return []
    }
  }

  private compareVersions = (a: string, b: string): number => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0)
      if (diff !== 0) return diff
    }
    return 0
  }

  private parseRaw(raw: any): FlowDefinition {
    if (!raw.id || !raw.name || !raw.nodes || !raw.edges) {
      throw new Error(`Invalid Flow: missing required fields. id=${raw.id}`)
    }

    const nodes = raw.nodes.map((n: any) => ({
      node_id: n.node_id,
      instance_id: n.instance_id,
      params: n.params || undefined,
      children: n.children,
      on_error: n.on_error,
      timeout: this.parseTimeout(n.timeout),
      events: n.events || undefined,
    }))

    const edges = raw.edges.map((e: any) => ({
      from: e.from,
      to: e.to,
      when: e.when,
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
      ui,
    }
  }

  private parseUI(raw: any): WorkflowUIDescriptor {
    if (!raw) return {}
    return this.stripYamlMultilineStrings(raw)
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
