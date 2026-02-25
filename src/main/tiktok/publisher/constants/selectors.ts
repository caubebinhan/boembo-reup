// TikTok Studio selectors.
// Prefer data-e2e attributes over text matches when possible.

export const TIKTOK_SELECTORS = {
    UPLOAD: {
        FILE_INPUT: 'input[type="file"]',
        UPLOAD_BUTTONS: [
            '[data-e2e="select-file"]',
            '[data-e2e="upload-card"]',
        ],
        READY_INDICATORS: [
            '[data-e2e="upload-complete"]',
            '[data-e2e="post_video_button"]',
            '[data-e2e="replace-video"]',
            '.tiktok-switch',
        ],
    },
    CAPTION: {
        EDITOR: [
            '[data-e2e="caption-editor"]',
            '[data-contents="true"]',
            '.public-DraftEditor-content',
            '[contenteditable="true"]',
        ],
    },
    POST: {
        BUTTON: '[data-e2e="post_video_button"]',
        CONFIRM_BUTTONS: [
            'div[role="dialog"] [data-e2e="post_video_button"]',
            'div[role="dialog"] button:has-text("Post")',
            'div[role="dialog"] button:has-text("Post now")',
            'div[role="dialog"] button:has-text("今すぐ投稿")',
            'div[role="dialog"] button:has-text("Đăng")',
        ],
    },
    CAPTCHA: {
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
        INDICATORS: [
            '[data-e2e="manage-posts"]',
            '[data-e2e="upload-success"]',
            'div[data-tt="components_PostTable_Container"]',
        ],
    },
} as const
