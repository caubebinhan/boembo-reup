export interface PublishOptions {
    username?: string
    advancedVerification?: boolean
    privacy?: 'public' | 'friends' | 'private'
    useProfileSession?: boolean
}

export type PublishErrorType = 'captcha' | 'violation' | 'session_expired' | 'upload_failed' | 'unknown'

export interface PublishResult {
    success: boolean
    videoId?: string
    videoUrl?: string
    isReviewing?: boolean
    publishStatus?: 'public' | 'under_review' | 'verification_incomplete'
    verificationIncomplete?: boolean
    error?: string
    errorType?: PublishErrorType
    warning?: string
    debugArtifacts?: {
        screenshot?: string
        html?: string
        logs?: string[]
        sessionLog?: string
        checkpoints?: string[]
        cookieSnapshot?: string
        cookieInputSnapshot?: string
        videoMetadata?: string
    }
}
