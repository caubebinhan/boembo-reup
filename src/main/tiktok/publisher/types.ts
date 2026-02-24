export interface PublishOptions {
    username?: string
    advancedVerification?: boolean
    privacy?: 'public' | 'friends' | 'private'
}

export type PublishErrorType = 'captcha' | 'violation' | 'session_expired' | 'upload_failed' | 'unknown'

export interface PublishResult {
    success: boolean
    videoId?: string
    videoUrl?: string
    isReviewing?: boolean
    error?: string
    errorType?: PublishErrorType
    warning?: string
    debugArtifacts?: {
        screenshot?: string
        html?: string
        logs?: string[]
    }
}
