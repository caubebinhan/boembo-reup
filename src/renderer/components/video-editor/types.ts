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
  default?: unknown
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: Array<{ value: string; label: string; icon?: string }>
  description?: string
  condition?: { field: string; value: unknown }
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
  params: Record<string, unknown>
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
  transform: { bg: '#d9ebf2', border: '#84b9cc', text: '#155e75' },
  overlay: { bg: '#e7efe2', border: '#a8c89b', text: '#365314' },
  filter: { bg: '#f9e8d5', border: '#efb676', text: '#9a3412' },
  audio: { bg: '#e7ebf7', border: '#99a7d8', text: '#3730a3' },
  'anti-detect': { bg: '#f4e4dc', border: '#d7a892', text: '#7c2d12' },
}

/** Editorial warm-light palette (shared across editor components) */
export const V = {
  bg: '#f5f7fb',
  cream: '#eef2f7',
  beige: '#cbd5e1',
  card: '#ffffff',
  charcoal: '#0f172a',
  textMuted: '#334155',
  textDim: '#64748b',
  accent: '#0ea5e9',
  accentSoft: '#e0f2fe',
  pastelPink: '#ffe4e6',
  pastelMint: '#dcfce7',
  pastelBlue: '#dbeafe',
  pastelPeach: '#ffedd5',
  pastelYellow: '#fef9c3',
}
