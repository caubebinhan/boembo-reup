/**
 * Core Infrastructure Cases
 * ─────────────────────────
 * System-level health checks that are workflow-agnostic.
 * Any workflow can reuse these to verify infrastructure readiness.
 */
import type { TroubleshootingCaseDefinition } from '@main/services/troubleshooting/types'

const CORE_CASE_BASE = {
  risk: 'safe' as const,
  category: 'core',
  group: 'core',
  workflowId: '*',
  workflowVersion: '*',
  implemented: true,
}

export const coreCases: TroubleshootingCaseDefinition[] = [
  {
    ...CORE_CASE_BASE,
    id: 'core.health.ffmpeg',
    title: 'FFmpeg Availability',
    description: 'Verify FFmpeg and FFprobe binaries are installed and return version info.',
    errorCode: 'DG-001',
    tags: ['core', 'ffmpeg', 'health'],
    level: 'basic',
  },
  {
    ...CORE_CASE_BASE,
    id: 'core.health.db-connection',
    title: 'Database Connection',
    description: 'Open and query the database to verify it responds.',
    errorCode: 'DG-002',
    tags: ['core', 'db', 'health'],
    level: 'basic',
  },
  {
    ...CORE_CASE_BASE,
    id: 'core.health.media-dir',
    title: 'Media Directory Writable',
    description: 'Verify the configured media directory exists and is writable.',
    errorCode: 'DG-003',
    tags: ['core', 'media', 'disk', 'health'],
    level: 'basic',
  },
  {
    ...CORE_CASE_BASE,
    id: 'core.health.sentry',
    title: 'Sentry Connection',
    description: 'Send a test event to Sentry and verify it is accepted.',
    errorCode: 'DG-004',
    tags: ['core', 'sentry', 'health'],
    level: 'basic',
  },
  {
    ...CORE_CASE_BASE,
    id: 'core.health.browser-profile',
    title: 'Browser Profile Accessible',
    description: 'Check that the default browser profile path exists and is not locked.',
    errorCode: 'DG-005',
    tags: ['core', 'browser', 'profile', 'health'],
    level: 'basic',
  },
  {
    ...CORE_CASE_BASE,
    id: 'core.health.network',
    title: 'Network Connectivity',
    description: 'Ping an external endpoint to verify outbound network access.',
    errorCode: 'DG-006',
    tags: ['core', 'network', 'health'],
    level: 'basic',
  },
]
