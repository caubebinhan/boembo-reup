const VALID_SAME_SITE = new Set(['Strict', 'Lax', 'None'])

// Map browser cookie sameSite strings → Playwright accepted values
const SAME_SITE_MAP: Record<string, string> = {
    'no_restriction': 'None',
    'lax': 'Lax',
    'strict': 'Strict',
    'none': 'None',
    'unspecified': '',     // → delete
}

export function sanitizeCookies(cookies: any[]): any[] {
    return cookies.map(c => {
        const clean = { ...c }

        // Normalize sameSite
        if (clean.sameSite !== undefined) {
            const normalized = SAME_SITE_MAP[clean.sameSite] ?? clean.sameSite
            if (!normalized || !VALID_SAME_SITE.has(normalized)) {
                // Any unrecognized value — remove rather than crash
                delete clean.sameSite
            } else {
                clean.sameSite = normalized
            }
        }

        // Ensure tiktok domain
        if (clean.domain && !clean.domain.includes('tiktok.com')) {
            clean.domain = '.tiktok.com'
        }

        // Remove fields Playwright doesn't accept
        delete clean.hostOnly
        delete clean.session
        delete clean.storeId

        return clean
    })
}
