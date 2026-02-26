// ── Publish Account Document ─────────────────────
export interface AccountDocument {
  id: string
  platform: string
  username: string
  handle?: string
  avatar?: string
  cookies: any
  proxy?: string
  session_status: 'active' | 'expired'
  auto_caption: boolean
  auto_tags?: string
  created_at: number
  updated_at: number
}
