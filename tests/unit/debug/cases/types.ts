export type UnitCaseMeta = {
  objective: string
  labels: string[]
  investigationHints: string[]
}

export type UnitCaseDefinition = {
  id: string
  suite: 'unit'
  group: string
  title: string
  meta: UnitCaseMeta
  run: () => void | Promise<void>
}

export type UnitCaseGroupMeta = {
  objective: string
  investigationHints: string[]
}

export type UnitCaseGroup = {
  id: string
  label: string
  meta: UnitCaseGroupMeta
  cases: UnitCaseDefinition[]
}
