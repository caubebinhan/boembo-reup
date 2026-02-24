import { Page } from 'playwright-core'
import path from 'path'
import fs from 'fs-extra'
import { app } from 'electron'

export class DebugHelper {
    static async dumpPageState(page: Page, label: string): Promise<{ screenshot: string; html: string }> {
        const ts = Date.now()
        // Dump to userData for reliability
        const debugDir = path.join(app.getPath('userData'), 'debug_artifacts')
        await fs.ensureDir(debugDir)
        
        const screenshotPath = path.join(debugDir, `${label}_${ts}.png`)
        const htmlPath = path.join(debugDir, `${label}_${ts}.html`)
        
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true })
        } catch { }
        
        try {
            await fs.writeFile(htmlPath, await page.content())
        } catch { }

        console.log(`[DebugHelper] Dumped state '${label}' to ${debugDir}`)
        return { screenshot: screenshotPath, html: htmlPath }
    }
}
