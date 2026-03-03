/**
 * Video Editor — Shared Types
 * ───────────────────────────
 * Single source of truth for all video editor component types.
 * Matches the PluginManifest serialized from the main process.
 */

export interface PluginConfigField {
  key: string
  type: string
  label: string
  default?: any
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: Array<{ value: string; label: string; icon?: string }>
  description?: string
  condition?: { field: string; value: any }
  isArray?: boolean
  arrayFields?: PluginConfigField[]
  placeholder?: string
  required?: boolean
}

export interface PluginMeta {
  id: string
  name: string
  group: string
  icon: string
  description: string
  version: string
  source: string
  previewHint: string
  configSchema: PluginConfigField[]
  defaultEnabled?: boolean
  allowMultipleInstances?: boolean
  addInstanceLabel?: string
  recommended?: boolean
  warning?: string
}

export interface VideoEditOperation {
  id: string
  pluginId: string
  enabled: boolean
  params: Record<string, any>
  order: number
}

/** Groups for the left toolbar */
export const PLUGIN_GROUPS: { id: string; emoji: string; label: string }[] = [
  { id: 'overlay', emoji: '🖼️', label: 'Overlay' },
  { id: 'transform', emoji: '📐', label: 'Transform' },
  { id: 'filter', emoji: '✨', label: 'Effects' },
  { id: 'audio', emoji: '🔊', label: 'Audio' },
  { id: 'anti-detect', emoji: '🛡️', label: 'Protect' },
]

export const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  transform: { bg: '#d6e4f0', border: '#93b4d4', text: '#2e5a88' },
  overlay: { bg: '#e8d5f5', border: '#c09ee0', text: '#6b3fa0' },
  filter: { bg: '#f4dce0', border: '#e0a8b0', text: '#9e3d4d' },
  audio: { bg: '#d4e8d8', border: '#94c8a0', text: '#2e6e3e' },
  'anti-detect': { bg: '#f9e3d3', border: '#e0b896', text: '#8e5a2b' },
}

/** Vintage Pastel palette (shared across editor components) */
export const V = {
  bg: '#fcfbf8',
  cream: '#f5f3ee',
  beige: '#e8e4db',
  card: '#ffffff',
  charcoal: '#2c2a29',
  textMuted: '#5c5551',
  textDim: '#6f6660',
  accent: '#7c3aed',
  accentSoft: '#f3effe',
  pastelPink: '#f4dce0',
  pastelMint: '#d4e8d8',
  pastelBlue: '#d6e4f0',
  pastelPeach: '#f9e3d3',
  pastelYellow: '#fef3c7',
}
