// ── TikTok Studio data-e2e selectors ────────────────────────────────────────
// Prefer data-e2e attributes over text-matches. Fall back to text only as last resort.

export const TIKTOK_SELECTORS = {
    UPLOAD: {
        /** File input triggers — tried in order */
        FILE_INPUT: 'input[type="file"]',
        UPLOAD_BUTTONS: [
            '[data-e2e="select-file"]',
            '[data-e2e="upload-card"]',
        ],
        /** Indicators that the video file has been processed and is ready */
        READY_INDICATORS: [
            '[data-e2e="upload-complete"]',
            '[data-e2e="post_video_button"]',
            '[data-e2e="replace-video"]',
            '.tiktok-switch',
        ],
    },
    CAPTION: {
        /** Caption editor selectors — tried in order */
        EDITOR: [
            '[data-e2e="caption-editor"]',
            '[data-contents="true"]',
            '.public-DraftEditor-content',
            '[contenteditable="true"]',
        ],
    },
    POST: {
        /** Primary post button */
        BUTTON: '[data-e2e="post_video_button"]',
        /** Confirm dialogs after clicking post */
        CONFIRM_BUTTONS: [
            'div[role="dialog"] [data-e2e="post_video_button"]',
            'div[role="dialog"] button:has-text("Post")',
            'div[role="dialog"] button:has-text("Đăng")',
        ],
    },
    CAPTCHA: {
        /** CAPTCHA container selectors */
        INDICATORS: [
            '[data-e2e="captcha-container"]',
            'iframe[src*="captcha"]',
            '#captcha-container',
            '.captcha_verify_container',
            'div[class*="captcha"]',
        ],
    },
    ERRORS: {
        TOAST: '[data-e2e="toast-message"], .tiktok-toast, [role="alert"]',
        VIOLATION: [
            'text="Content may be restricted"',
            'text="Violation reason"',
            'text="Nội dung có thể bị hạn chế"',
        ],
    },
    SUCCESS: {
        /** Post-publish success indicators */
        INDICATORS: [
            '[data-e2e="manage-posts"]',
            '[data-e2e="upload-success"]',
            'div[data-tt="components_PostTable_Container"]',
        ],
    },
}
