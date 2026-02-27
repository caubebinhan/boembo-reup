export type TroubleCaseLevel = 'basic' | 'intermediate' | 'advanced'
export type TroubleCaseRisk = 'safe' | 'real_publish'
export type TroubleCaseSuite = 'e2e' | 'integration' | 'unit' | 'other'
export type TroubleArtifactType =
  | 'html'
  | 'screenshot'
  | 'session-log'
  | 'json'
  | 'db-snapshot'
  | 'text'
  | 'video'
  | 'other'

export type TroubleCaseLike = {
  id: string
  title: string
  risk: TroubleCaseRisk
  workflowId?: string
  workflowVersion?: string
  category?: string
  group?: string
  tags?: string[]
  level?: TroubleCaseLevel
}

export type TroubleArtifactPlanLike = {
  key: string
  type?: TroubleArtifactType
}

export type TroubleCaseGroupSection<TCase extends TroubleCaseLike = TroubleCaseLike> = {
  group: string
  items: TCase[]
}

export type TroubleCaseSuiteSection<TCase extends TroubleCaseLike = TroubleCaseLike> = {
  suite: TroubleCaseSuite
  label: string
  count: number
  groups: TroubleCaseGroupSection<TCase>[]
}

export type ArtifactViewMode = 'image' | 'text'

export type TroubleArtifactViewItem = {
  key: string
  textValue: string
  preview: string
  mode: ArtifactViewMode
  imageSrc?: string
  typeHint?: TroubleArtifactType
}

const SUITE_ORDER: TroubleCaseSuite[] = ['e2e', 'integration', 'unit', 'other']
const SUITE_LABEL: Record<TroubleCaseSuite, string> = {
  e2e: 'E2E',
  integration: 'Integration',
  unit: 'Unit',
  other: 'Other',
}

const LEVEL_RANK: Record<TroubleCaseLevel, number> = {
  basic: 1,
  intermediate: 2,
  advanced: 3,
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i

export function classifyCaseSuite(caseDef: TroubleCaseLike): TroubleCaseSuite {
  const tags = new Set((caseDef.tags || []).map(tag => String(tag).toLowerCase()))

  if (
    caseDef.risk === 'real_publish' ||
    tags.has('e2e') ||
    tags.has('browser') ||
    tags.has('artifact:screenshot')
  ) {
    return 'e2e'
  }

  if (
    tags.has('unit') ||
    tags.has('fixture') ||
    tags.has('static-analysis') ||
    tags.has('contract')
  ) {
    return 'unit'
  }

  if (
    tags.has('integration') ||
    tags.has('db') ||
    tags.has('events') ||
    tags.has('publish') ||
    tags.has('scan')
  ) {
    return 'integration'
  }

  return 'other'
}

export function groupCasesBySuiteAndGroup<TCase extends TroubleCaseLike>(
  cases: TCase[]
): TroubleCaseSuiteSection<TCase>[] {
  const suiteMap = new Map<TroubleCaseSuite, Map<string, TCase[]>>()

  for (const caseDef of cases) {
    const suite = classifyCaseSuite(caseDef)
    const group = caseDef.group || caseDef.category || 'other'
    if (!suiteMap.has(suite)) suiteMap.set(suite, new Map())
    const groupMap = suiteMap.get(suite)!
    if (!groupMap.has(group)) groupMap.set(group, [])
    groupMap.get(group)!.push(caseDef)
  }

  return [...suiteMap.entries()]
    .sort((a, b) => SUITE_ORDER.indexOf(a[0]) - SUITE_ORDER.indexOf(b[0]))
    .map(([suite, groupMap]) => {
      const groups: TroubleCaseGroupSection<TCase>[] = [...groupMap.entries()]
        .map(([group, items]) => ({
          group,
          items: [...items].sort((left, right) => {
            const leftRank = left.level ? LEVEL_RANK[left.level] : 9
            const rightRank = right.level ? LEVEL_RANK[right.level] : 9
            if (leftRank !== rightRank) return leftRank - rightRank
            return left.title.localeCompare(right.title)
          }),
        }))
        .sort((a, b) => a.group.localeCompare(b.group))

      const count = groups.reduce((sum, section) => sum + section.items.length, 0)
      return {
        suite,
        label: SUITE_LABEL[suite],
        count,
        groups,
      }
    })
}

export function toArtifactText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function looksLikeAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/')
}

function toLocalThumbUrl(filePath: string): string {
  return `local-thumb://${filePath.replace(/\\/g, '/')}`
}

export function shouldRenderArtifactAsImage(textValue: string, typeHint?: TroubleArtifactType): boolean {
  if (!textValue) return false
  if (typeHint === 'screenshot') return true
  if (textValue.startsWith('data:image/')) return true
  if (textValue.startsWith('local-thumb://')) return true
  if (textValue.startsWith('file://')) return IMAGE_EXT_RE.test(textValue)
  if (/^https?:\/\//i.test(textValue)) return IMAGE_EXT_RE.test(textValue)
  if (looksLikeAbsolutePath(textValue)) return IMAGE_EXT_RE.test(textValue)
  return false
}

export function toArtifactImageSrc(textValue: string): string {
  if (textValue.startsWith('data:image/')) return textValue
  if (textValue.startsWith('local-thumb://')) return textValue
  if (textValue.startsWith('file://')) return textValue
  if (/^https?:\/\//i.test(textValue)) return textValue
  if (looksLikeAbsolutePath(textValue)) return toLocalThumbUrl(textValue)
  return textValue
}

export function mapArtifactsForView(
  artifacts: Record<string, unknown> | undefined,
  artifactPlan?: TroubleArtifactPlanLike[]
): TroubleArtifactViewItem[] {
  if (!artifacts || typeof artifacts !== 'object') return []

  const typeByKey = new Map<string, TroubleArtifactType | undefined>()
  for (const spec of artifactPlan || []) {
    typeByKey.set(spec.key, spec.type)
  }

  return Object.entries(artifacts)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const textValue = toArtifactText(value)
      const typeHint = typeByKey.get(key)
      const mode: ArtifactViewMode = shouldRenderArtifactAsImage(textValue, typeHint) ? 'image' : 'text'
      return {
        key,
        textValue,
        preview: textValue.length > 260 ? `${textValue.slice(0, 260)}...` : textValue,
        mode,
        imageSrc: mode === 'image' ? toArtifactImageSrc(textValue) : undefined,
        typeHint,
      }
    })
}
