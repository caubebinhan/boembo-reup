import { Page } from 'playwright-core'
import { TIKTOK_SELECTORS } from './constants/selectors'
import { DebugHelper } from './helpers/DebugHelper'

// ── File uploader for TikTok Studio ─────────────────────────────────────────

export class FileUploader {
    private lastUploadError: string | null = null

    constructor(private page: Page, private onProgress?: (msg: string) => void) {}

    async upload(filePath: string): Promise<void> {
        const MAX_RETRIES = 3

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            this.progress(`Uploading video (attempt ${attempt}/${MAX_RETRIES})...`)

            const uploaded = await this.attemptUpload(filePath)
            if (uploaded) return

            if (attempt < MAX_RETRIES) {
                console.log(`[FileUploader] Attempt ${attempt} failed, retrying...`)
                await this.page.reload()
                await this.page.waitForTimeout(3000)
            }
        }

        throw new Error(this.lastUploadError || `File upload failed after ${MAX_RETRIES} attempts`)
    }

    private async attemptUpload(filePath: string): Promise<boolean> {
        this.progress('Looking for file input...')

        // ── Step 1: Find file input ─────────────────────
        let fileInput = await this.page.$(TIKTOK_SELECTORS.UPLOAD.FILE_INPUT)

        if (!fileInput) {
            // Try clicking data-e2e upload buttons to reveal input
            for (const btnSel of TIKTOK_SELECTORS.UPLOAD.UPLOAD_BUTTONS) {
                try {
                    const btn = this.page.locator(btnSel).first()
                    if (await btn.isVisible({ timeout: 3000 })) {
                        console.log(`[FileUploader] Clicking upload trigger: ${btnSel}`)
                        await btn.click({ force: true })
                        await this.page.waitForTimeout(1500)
                        fileInput = await this.page.$(TIKTOK_SELECTORS.UPLOAD.FILE_INPUT)
                        if (fileInput) break
                    }
                } catch {}
            }
        }

        // ── Step 2: Wait for file input ─────────────────
        if (!fileInput) {
            try {
                fileInput = await this.page.waitForSelector(TIKTOK_SELECTORS.UPLOAD.FILE_INPUT, {
                    state: 'attached', timeout: 10000
                })
            } catch {
                await DebugHelper.dumpPageState(this.page, 'upload_no_input')
                throw new Error('File input not found on upload page — debug artifacts saved')
            }
        }

        if (!fileInput) throw new Error('File input element missing')

        // ── Step 3: Set file ────────────────────────────
        console.log(`[FileUploader] Setting file: ${filePath}`)
        await fileInput.setInputFiles(filePath)

        // ── Step 4: Wait for upload completion ──────────
        this.progress('Waiting for upload to complete...')

        for (let cycle = 0; cycle < 60; cycle++) {
            await this.page.waitForTimeout(2000)

            // Check CAPTCHA during upload
            await this.checkCaptchaDuringUpload()

            // Check for toast errors
            try {
                const toast = this.page.locator(TIKTOK_SELECTORS.ERRORS.TOAST).first()
                if (await toast.isVisible({ timeout: 500 })) {
                    const errText = await toast.textContent()
                    console.log(`[FileUploader] Upload error: "${errText}"`)
                    this.lastUploadError = `Upload toast error: ${(errText || '').trim()}`
                    await DebugHelper.dumpPageState(this.page, 'upload_toast_error').catch(() => {})
                    return false
                }
            } catch {}

            // Check ready indicators
            for (const sel of TIKTOK_SELECTORS.UPLOAD.READY_INDICATORS) {
                try {
                    const el = this.page.locator(sel).first()
                    if (await el.isVisible({ timeout: 500 })) {
                        console.log(`[FileUploader] Upload ready: ${sel}`)
                        return true
                    }
                } catch {}
            }

            if (cycle % 10 === 0 && cycle > 0) {
                console.log(`[FileUploader] Still uploading... (${cycle * 2}s)`)
            }
        }

        return false
    }

    private async checkCaptchaDuringUpload(): Promise<void> {
        for (const sel of TIKTOK_SELECTORS.CAPTCHA.INDICATORS) {
            try {
                const el = this.page.locator(sel).first()
                if (await el.isVisible({ timeout: 500 })) {
                    await DebugHelper.dumpPageState(this.page, 'captcha_during_upload')
                    throw new Error('CAPTCHA_DETECTED: CAPTCHA appeared during upload')
                }
            } catch (e: any) {
                if (e.message.includes('CAPTCHA_DETECTED')) throw e
            }
        }
    }

    private progress(msg: string) {
        if (this.onProgress) this.onProgress(msg)
    }
}
