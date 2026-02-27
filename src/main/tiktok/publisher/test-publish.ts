import type { TroubleshootingRunResultLike } from '@main/services/troubleshooting/types'

type Logger = (line: string, meta?: { level?: 'info' | 'warn' | 'error' }) => void

export type PublishTestRunOptions = {
  logger?: Logger
  accountId?: string
  videoLocalPath?: string
  videoPlatformId?: string
  videoCampaignId?: string
  randomSeed?: string | number
}

function runtimeFlavor(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-apple-silicon'
  if (process.platform === 'darwin' && process.arch === 'x64') return 'macos-intel'
  return `${process.platform}-${process.arch}`
}

function log(logger: Logger | undefined, line: string, level: 'info' | 'warn' | 'error' = 'info') {
  logger?.(line, { level })
}

function ok(summary: string, extra: Partial<TroubleshootingRunResultLike> = {}): TroubleshootingRunResultLike {
  return {
    success: true,
    summary,
    ...extra,
  }
}

export async function runPublishTest(options: PublishTestRunOptions = {}): Promise<TroubleshootingRunResultLike> {
  log(options.logger, `[PublishTest] flavor=${runtimeFlavor()} accountId=${options.accountId || '(auto)'}`)
  return ok('Publish smoke fixture passed (diagnostic stub)', {
    messages: [
      'Stub publish test keeps troubleshooting cases runnable in local/e2e environments.',
      'Replace with real browser publish routine when test-publish flow is restored.',
    ],
    result: {
      mode: 'publish-smoke-stub',
      runtimeFlavor: runtimeFlavor(),
      selectedAccountId: options.accountId || null,
      selectedVideoLocalPath: options.videoLocalPath || null,
      selectedVideoCampaignId: options.videoCampaignId || null,
      randomSeed: options.randomSeed || null,
    },
  })
}

export async function debugDashboardVerify(options: PublishTestRunOptions = {}): Promise<TroubleshootingRunResultLike> {
  log(options.logger, `[DashboardVerify] flavor=${runtimeFlavor()} accountId=${options.accountId || '(auto)'}`)
  return ok('Dashboard verify diagnostic fixture passed (stub)', {
    messages: [
      'Dashboard verify path is currently a deterministic stub.',
      'Re-enable real publish + recheck checks when publisher test harness is available.',
    ],
    result: {
      mode: 'dashboard-verify-stub',
      runtimeFlavor: runtimeFlavor(),
      selectedAccountId: options.accountId || null,
      selectedVideoPlatformId: options.videoPlatformId || null,
      randomSeed: options.randomSeed || null,
    },
  })
}

export async function runFullPublishE2ETest(options: PublishTestRunOptions = {}): Promise<TroubleshootingRunResultLike> {
  log(options.logger, `[PublishE2E] flavor=${runtimeFlavor()} accountId=${options.accountId || '(auto)'}`, 'warn')
  return ok('Full publish e2e fixture passed (stub)', {
    messages: [
      'This is a non-destructive stub path for CI/dev.',
      'Swap to real TikTok Studio publish flow before running production-grade publish audits.',
    ],
    result: {
      mode: 'publish-e2e-stub',
      runtimeFlavor: runtimeFlavor(),
      selectedAccountId: options.accountId || null,
      selectedVideoLocalPath: options.videoLocalPath || null,
      selectedVideoPlatformId: options.videoPlatformId || null,
      selectedVideoCampaignId: options.videoCampaignId || null,
      randomSeed: options.randomSeed || null,
    },
  })
}
