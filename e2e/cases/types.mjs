/**
 * @typedef {Object} E2ECaseMeta
 * @property {string} objective
 * @property {string[]} labels
 * @property {string[]} investigationHints
 *
 * @typedef {Object} E2ECaseContext
 * @property {import('playwright').Page} page
 * @property {typeof import('node:assert/strict')} assert
 *
 * @typedef {Object} E2ECaseDefinition
 * @property {string} id
 * @property {'e2e'} suite
 * @property {string} group
 * @property {string} title
 * @property {E2ECaseMeta} meta
 * @property {(ctx: E2ECaseContext) => Promise<void>} run
 *
 * @typedef {Object} E2ECaseGroup
 * @property {string} id
 * @property {string} label
 * @property {{ objective: string, investigationHints: string[] }} meta
 * @property {E2ECaseDefinition[]} cases
 */

/**
 * @param {E2ECaseGroup[]} caseGroups
 */
export function buildE2ECaseIndex(caseGroups) {
  const caseIndex = new Map()
  for (const group of caseGroups) {
    for (const caseDef of group.cases) {
      caseIndex.set(caseDef.id, caseDef)
    }
  }
  return caseIndex
}
