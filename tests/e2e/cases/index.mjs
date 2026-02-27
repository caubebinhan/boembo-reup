import { buildE2ECaseIndex } from './types.mjs'
import { troubleshootingPanelCaseGroup } from './troubleshooting/index.mjs'

/** @type {import('./types.mjs').E2ECaseGroup[]} */
export const e2eCaseGroups = [
  troubleshootingPanelCaseGroup,
]

export const e2eCaseIndex = buildE2ECaseIndex(e2eCaseGroups)
