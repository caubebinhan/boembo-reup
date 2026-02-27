import { describe, it } from 'vitest'
import { unitCaseGroups } from './cases'

const onlyCaseId = process.env.UNIT_CASE_ID?.trim()

describe('Troubleshooting Panel Helpers', () => {
  for (const group of unitCaseGroups) {
    describe(`${group.label} [${group.id}]`, () => {
      for (const caseDef of group.cases) {
        const register = onlyCaseId && onlyCaseId !== caseDef.id ? it.skip : it
        register(`[${caseDef.id}] ${caseDef.title}`, async () => {
          await caseDef.run()
        })
      }
    })
  }
})
