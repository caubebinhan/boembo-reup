import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const mainEntry = path.resolve(process.cwd(), 'out', 'main', 'index.js')
const dbLogRoot = path.resolve(process.cwd(), '.test-db', 'e2e-video-editor')
const latestDbFile = path.resolve(dbLogRoot, 'LATEST_DB_PATHS.txt')
const reportRoot = path.resolve(process.cwd(), 'output', 'e2e-video-editor')

const onlyCaseId = process.env.TEST_CASE_ID?.trim()

function toSafeSlug(value) {
  return String(value || 'case').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function createDbPathForCase(caseId) {
  const runToken = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 9)}`
  return path.resolve(dbLogRoot, `${toSafeSlug(caseId)}-${runToken}.db`)
}

function appendLatestDbLog(caseId, dbPath) {
  mkdirSync(dbLogRoot, { recursive: true })
  writeFileSync(latestDbFile, `[${new Date().toISOString()}] ${caseId} => ${dbPath}\n`, {
    encoding: 'utf8',
    flag: 'a',
  })
}

function runFfmpeg(args, description) {
  const out = spawnSync(ffmpegPath, args, {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (out.status === 0) return
  const detail = [out.stderr, out.stdout].filter(Boolean).join('\n').slice(0, 2000)
  throw new Error(`FFmpeg fixture failed: ${description}\n${detail}`)
}

function ensureFixtureAssets() {
  const dir = path.resolve(reportRoot, 'fixtures')
  mkdirSync(dir, { recursive: true })

  const inputVideoPath = path.join(dir, 'input.mp4')
  const backgroundVideoPath = path.join(dir, 'background.mp4')
  const imagePath = path.join(dir, 'overlay.jpg')
  const backgroundImagePath = path.join(dir, 'background.jpg')
  const audioPath = path.join(dir, 'audio.mp3')

  if (!existsSync(inputVideoPath)) {
    runFfmpeg(
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc=size=360x640:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=880:sample_rate=44100',
        '-t', '4',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
        inputVideoPath,
      ],
      'input.mp4',
    )
  }

  if (!existsSync(backgroundVideoPath)) {
    runFfmpeg(
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=blue:size=360x640:rate=30',
        '-f', 'lavfi',
        '-i', 'sine=frequency=330:sample_rate=44100',
        '-t', '4',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
        backgroundVideoPath,
      ],
      'background.mp4',
    )
  }

  if (!existsSync(imagePath)) {
    runFfmpeg(
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=red:size=360x200',
        '-frames:v', '1',
        imagePath,
      ],
      'overlay.jpg',
    )
  }

  if (!existsSync(backgroundImagePath)) {
    runFfmpeg(
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=green:size=360x640',
        '-frames:v', '1',
        backgroundImagePath,
      ],
      'background.jpg',
    )
  }

  if (!existsSync(audioPath)) {
    runFfmpeg(
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'sine=frequency=660:sample_rate=44100',
        '-t', '4',
        '-c:a', 'libmp3lame',
        '-q:a', '2',
        audioPath,
      ],
      'audio.mp3',
    )
  }

  return {
    inputVideoPath,
    backgroundVideoPath,
    imagePath,
    backgroundImagePath,
    audioPath,
  }
}

async function launchAppForCase(caseId) {
  if (!existsSync(mainEntry)) {
    throw new Error(`Missing Electron build output: ${mainEntry}. Run "electron-vite build" first.`)
  }

  const dbPath = createDbPathForCase(caseId)
  appendLatestDbLog(caseId, dbPath)

  const requestedHeadless = process.env.E2E_HEADLESS?.trim()
  const launchEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    REPOST_IO_DB_PATH: dbPath,
    E2E_HEADLESS: requestedHeadless || '1',
  }
  delete launchEnv.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [mainEntry],
    timeout: 120_000,
    env: launchEnv,
  })
  const logBuffer = []
  const childProc = app.process()
  const bindStream = (stream, source) => {
    if (!stream) return
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      const text = String(chunk || '')
      if (!text) return
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) continue
        logBuffer.push(`[${source}] ${line}`)
        if (logBuffer.length > 20_000) logBuffer.shift()
      }
    })
  }
  bindStream(childProc?.stdout, 'electron:stdout')
  bindStream(childProc?.stderr, 'electron:stderr')

  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1600, height: 980 })
  await page.getByRole('button', { name: /new campaign/i }).waitFor({ state: 'visible', timeout: 120_000 })
  return { app, page, logBuffer }
}

function buildDefaultParams(meta) {
  const params = {}
  const schema = Array.isArray(meta?.configSchema) ? meta.configSchema : []
  for (const field of schema) {
    if (field.default !== undefined) {
      params[field.key] = field.default
    }
    if (field.isArray && Array.isArray(field.arrayFields) && params[field.key] === undefined) {
      const item = {}
      for (const subField of field.arrayFields) {
        if (subField.default !== undefined) item[subField.key] = subField.default
      }
      params[field.key] = [item]
    }
  }
  return params
}

function resolveAssetForField(fieldKey, fixtures) {
  const key = String(fieldKey || '').toLowerCase()
  if (key.includes('audio')) return fixtures.audioPath
  if (key.includes('video')) return fixtures.backgroundVideoPath
  if (key.includes('background') && key.includes('image')) return fixtures.backgroundImagePath
  return fixtures.imagePath
}

function fillRequiredParams(meta, params, fixtures) {
  const schema = Array.isArray(meta?.configSchema) ? meta.configSchema : []
  for (const field of schema) {
    if (!field.required) continue
    if (params[field.key] !== undefined && params[field.key] !== null && params[field.key] !== '') continue

    if (field.type === 'asset') {
      params[field.key] = resolveAssetForField(field.key, fixtures)
      continue
    }
    if (field.type === 'string') {
      params[field.key] = `${meta.id} e2e`
      continue
    }
    if (field.type === 'timeRange') {
      params[field.key] = { start: 0.2, end: 1.5 }
      continue
    }
    if (field.type === 'region') {
      params[field.key] = { x: 10, y: 10, w: 30, h: 30 }
      continue
    }
    if (field.type === 'boolean') {
      params[field.key] = true
      continue
    }
    if ((field.type === 'number' || field.type === 'slider') && field.min !== undefined) {
      params[field.key] = field.min
      continue
    }
    if (field.type === 'select' && Array.isArray(field.options) && field.options[0]) {
      params[field.key] = field.options[0].value
    }
  }
}

function applyPluginOverrides(pluginId, params, fixtures) {
  switch (pluginId) {
    case 'builtin.audio_replace':
      params.audioFile = fixtures.audioPath
      params.mode = 'mix'
      params.loop = false
      params.originalVolume = 0.5
      params.newVolume = 0.8
      break
    case 'builtin.mute_segment':
      params.timeRange = { start: 0.4, end: 1.6 }
      break
    case 'builtin.watermark_text':
      params.text = 'E2E WATERMARK'
      params.fontFamily = 'Arial'
      params.fontColor = '#00ff00'
      params.bgColor = '#000000'
      params.bgOpacity = 0.3
      break
    case 'builtin.watermark_image':
      params.image = fixtures.imagePath
      params.size = 18
      params.position = 'top-left'
      params.rotation = 12
      params.keepAspectRatio = true
      break
    case 'builtin.logo_sequence':
      params.image = fixtures.imagePath
      params.appearances = [{ startTime: 0.2, endTime: 1.4, position: 'top-right' }]
      break
    case 'builtin.background_image':
      params.image = fixtures.backgroundImagePath
      params.fitMode = 'cover'
      params.blur = 8
      params.foregroundScale = 85
      break
    case 'builtin.background_video':
      params.video = fixtures.backgroundVideoPath
      params.fitMode = 'cover'
      params.blur = 8
      params.foregroundScale = 85
      break
    case 'builtin.blur_region':
      params.region = { x: 15, y: 15, w: 30, h: 25 }
      params.intensity = 15
      break
    case 'builtin.resize':
      params.width = 320
      params.height = -1
      break
    case 'builtin.rotate':
      params.angle = '90'
      params.flip = 'none'
      break
    case 'builtin.speed':
      params.speed = 1.25
      params.preservePitch = true
      break
    case 'builtin.trim':
      params.mode = 'keep'
      params.startTime = 0.2
      params.endTime = 2.2
      break
    case 'builtin.volume':
      params.volume = 120
      params.normalize = false
      break
    case 'builtin.color_grade':
      params.preset = 'warm'
      break
    case 'builtin.pad':
      params.targetWidth = 640
      params.targetHeight = 640
      params.bgMode = 'color'
      params.bgColor = '#101010'
      break
    case 'builtin.crop':
      params.mode = 'aspect'
      params.aspectRatio = '1:1'
      params.position = 'center'
      break
    case 'builtin.audio_fade':
      params.fadeIn = 0.4
      params.fadeOut = 0.4
      break
    case 'builtin.denoise':
      params.method = 'hqdn3d'
      params.strength = 'light'
      break
    default:
      break
  }
}

async function getPluginMetas(page) {
  const metas = await page.evaluate(() => window.api.invoke('video-edit:get-plugin-metas'))
  return Array.isArray(metas) ? metas : []
}

async function previewSinglePlugin(page, videoPath, pluginId, params, idx) {
  const payload = {
    requestId: `video_editor_plugin_${idx}_${Date.now().toString(36)}`,
    timeoutMs: 180_000,
    videoPath,
    operations: [
      {
        id: `op_${pluginId.replace(/[^a-z0-9_]/gi, '_')}_${idx}`,
        pluginId,
        enabled: true,
        order: 0,
        params,
      },
    ],
  }
  return page.evaluate((body) => window.api.invoke('video-edit:preview', body), payload)
}

function writeReport(report) {
  mkdirSync(reportRoot, { recursive: true })
  const pathOut = path.join(reportRoot, `plugin-preview-${Date.now()}.json`)
  writeFileSync(pathOut, JSON.stringify(report, null, 2), 'utf8')
  return pathOut
}

function registerCase(caseId, title, fn) {
  const runner = onlyCaseId && onlyCaseId !== caseId ? test.skip : test
  runner(`[video-editor] [${caseId}] ${title}`, { timeout: 1_800_000 }, fn)
}

registerCase('e2e.video-editor.plugins.preview-all', 'all video editor plugins render preview in headless mode', async () => {
  const fixtures = ensureFixtureAssets()
  const { app, page, logBuffer } = await launchAppForCase('video-editor-preview-all')
  const failures = []
  const successes = []
  const startedAt = Date.now()

  try {
    const metas = await getPluginMetas(page)
    assert.ok(metas.length >= 25, `Expected at least 25 plugins, got ${metas.length}`)
    const sorted = [...metas].sort((a, b) => String(a.id).localeCompare(String(b.id)))

    for (let i = 0; i < sorted.length; i++) {
      const meta = sorted[i]
      const params = buildDefaultParams(meta)
      fillRequiredParams(meta, params, fixtures)
      applyPluginOverrides(meta.id, params, fixtures)
      const logIndex = logBuffer.length

      console.log(`[video-editor e2e] ${i + 1}/${sorted.length} preview ${meta.id}`)
      const runStart = Date.now()
      const result = await previewSinglePlugin(page, fixtures.inputVideoPath, meta.id, params, i)
      const elapsedMs = Date.now() - runStart

      const failed = Boolean(result?.error) || !result?.outputPath || result?.wasModified !== true
      if (failed) {
        failures.push({
          pluginId: meta.id,
          elapsedMs,
          error: result?.error || 'No outputPath or wasModified=false',
          wasModified: result?.wasModified,
          outputPath: result?.outputPath || null,
          traceTail: Array.isArray(result?.trace) ? result.trace.slice(-5) : [],
          processLogTail: logBuffer.slice(Math.max(logIndex - 5, 0)).slice(-80),
          params,
        })
      } else {
        successes.push({
          pluginId: meta.id,
          elapsedMs,
          outputPath: result.outputPath,
        })
      }
    }
  } finally {
    await app.close()
  }

  const report = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    fixturePaths: fixtures,
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures,
  }
  const reportPath = writeReport(report)
  console.log(`[video-editor e2e] report: ${reportPath}`)

  if (failures.length > 0) {
    const details = failures
      .map((f, idx) => `${idx + 1}. ${f.pluginId} -> ${f.error}`)
      .join('\n')
    assert.fail(`Video editor plugin preview failures (${failures.length}):\n${details}\nReport: ${reportPath}`)
  }
})

registerCase('e2e.video-editor.window.open-close', 'video editor child window opens and closes in headless mode', async () => {
  const fixtures = ensureFixtureAssets()
  const { app, page } = await launchAppForCase('video-editor-window-open-close')

  try {
    const beforeCount = app.windows().length
    await page.evaluate((videoPath) => window.api.invoke('video-editor:open', {
      data: {
        _videoPath: videoPath,
        _previewVideoSrc: null,
        videoEditOperations: [],
      },
    }), fixtures.inputVideoPath)

    const childWindow = await app.waitForEvent('window', { timeout: 60_000 })
    await childWindow.waitForLoadState('domcontentloaded', { timeout: 60_000 })
    const hash = await childWindow.evaluate(() => window.location.hash)
    assert.equal(hash, '#/video-editor')

    const title = await childWindow.title()
    assert.match(title, /video editor/i)

    const afterOpenCount = app.windows().length
    assert.equal(afterOpenCount, beforeCount + 1)

    await childWindow.evaluate(() => window.api.invoke('video-editor:done', {
      videoEditOperations: [],
      _enabledPluginIds: [],
      _previewVideoSrc: null,
      _videoPath: null,
    }))

    await childWindow.waitForEvent('close', { timeout: 30_000 })
  } finally {
    await app.close()
  }
})

test.after(() => {
  const previewTempDir = path.resolve(process.env.TEMP || process.env.TMP || process.cwd(), 'boembo-video-preview')
  rmSync(previewTempDir, { recursive: true, force: true })
})
