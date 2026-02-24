export function sanitizeCookies(cookies: any[]): any[] {
    return cookies.map(c => {
        const clean = { ...c }
        if (clean.sameSite === 'no_restriction') clean.sameSite = 'None'
        if (clean.sameSite === 'unspecified') delete clean.sameSite
        
        // Ensure tiktok domain
        if (clean.domain && !clean.domain.includes('tiktok.com')) {
            clean.domain = '.tiktok.com'
        }
        return clean
    })
}
