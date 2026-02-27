import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'
import { asyncVerifyCases } from './asyncVerify'
import { campaignCases } from './campaign'
import { captionTransformCases } from './captionTransform'
import { compatCases } from './compat'
import { networkCases } from './network'
import { publishCases } from './publish'
import { recoveryCases } from './recovery'
import { scanCases } from './scan'
import { smokeCases } from './smoke'
import { thumbnailCases } from './thumbnail'

export const tiktokRepostV1Cases: TroubleshootingCaseDefinition[] = [
  ...smokeCases,
  ...campaignCases,
  ...scanCases,
  ...thumbnailCases,
  ...captionTransformCases,
  ...networkCases,
  ...publishCases,
  ...recoveryCases,
  ...compatCases,
  ...asyncVerifyCases,
]
