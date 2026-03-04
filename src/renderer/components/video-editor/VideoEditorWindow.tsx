/**
 * Video Editor Window — CapCut-Style Layout
 * ──────────────────────────────────────────
 * Thin composition layer: uses useEditorState hook + sub-components.
 * Layout: Left toolbar | Center preview | Right properties | Bottom timeline
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import type { ReactElement } from 'react'
import { useEditorState } from './useEditorState'
import { EditorToolbar } from './EditorToolbar'
import { EditorProperties } from './EditorProperties'
import { EditorTimeline } from './EditorTimeline'
import { KonvaCanvasSurface } from './KonvaCanvasSurface'
import { EditorTracePanel } from './EditorTracePanel'
import { V } from './types'

export default function VideoEditorWindow(): ReactElement {
    const state = useEditorState()
    const videoRef = useRef<HTMLVideoElement>(null)
    const previewViewportRef = useRef<HTMLDivElement>(null)
    const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })
    const [videoFrame, setVideoFrame] = useState({ x: 0, y: 0, w: 0, h: 0 })
    const [videoDuration, setVideoDuration] = useState(30)

    // Sync video duration + currentTime
    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const onMeta = (): void => {
            state.handleSeek(0)
            setVideoDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 30)
        }
        const onTime = (): void => state.handleSeek(video.currentTime)
        video.addEventListener('loadedmetadata', onMeta)
        video.addEventListener('timeupdate', onTime)
        return () => {
            video.removeEventListener('loadedmetadata', onMeta)
            video.removeEventListener('timeupdate', onTime)
        }
    }, [state.videoSrc, state.previewSrc])

    // Track displayed video frame (content box) for canvas overlay
    const updateVideoLayout = useCallback(() => {
        const video = videoRef.current
        const viewport = previewViewportRef.current
        if (!video || !viewport) {
            setVideoDims({ w: 0, h: 0 })
            setVideoFrame({ x: 0, y: 0, w: 0, h: 0 })
            return
        }
        const viewportW = viewport.clientWidth
        const viewportH = viewport.clientHeight
        const sourceW = video.videoWidth || video.clientWidth
        const sourceH = video.videoHeight || video.clientHeight
        if (viewportW <= 0 || viewportH <= 0 || sourceW <= 0 || sourceH <= 0) {
            setVideoDims({ w: 0, h: 0 })
            setVideoFrame({ x: 0, y: 0, w: 0, h: 0 })
            return
        }
        const scale = Math.min(viewportW / sourceW, viewportH / sourceH)
        const w = Math.max(1, Math.round(sourceW * scale))
        const h = Math.max(1, Math.round(sourceH * scale))
        const x = Math.round((viewportW - w) / 2)
        const y = Math.round((viewportH - h) / 2)
        setVideoDims({ w, h })
        setVideoFrame({ x, y, w, h })
    }, [])

    useEffect(() => {
        const video = videoRef.current
        const viewport = previewViewportRef.current
        if (!video || !viewport) return
        const ro = new ResizeObserver(updateVideoLayout)
        ro.observe(viewport)
        video.addEventListener('loadedmetadata', updateVideoLayout)
        window.addEventListener('resize', updateVideoLayout)
        return () => {
            ro.disconnect()
            video.removeEventListener('loadedmetadata', updateVideoLayout)
            window.removeEventListener('resize', updateVideoLayout)
        }
    }, [state.videoSrc, state.previewSrc, updateVideoLayout])

    const displaySrc = state.previewSrc || state.videoSrc
    const timelineDuration = displaySrc ? videoDuration : 30

    return (
        <div className="video-editor-shell flex flex-col h-screen w-screen overflow-hidden" style={{ background: V.bg }}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 shrink-0"
                style={{ height: 44, background: V.card, borderBottom: `1px solid ${V.beige}` }}>
                <div className="flex items-center gap-2.5">
                    <span className="text-lg">🎬</span>
                    <h1 className="text-sm font-bold" style={{ color: V.charcoal }}>Video Editor</h1>
                    {state.previewSrc && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                            style={{ background: V.pastelMint, color: '#2e7d32' }}>RENDERED</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {displaySrc && (
                        <>
                            <button onClick={state.handleUploadVideo}
                                aria-label="Replace source video"
                                className="px-2.5 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer"
                                style={{ background: V.cream, color: V.textMuted, border: `1px solid ${V.beige}` }}>
                                🔄 Replace Source
                            </button>
                            <button onClick={() => state.handlePreview()}
                                disabled={state.isRendering || !state.videoPath}
                                aria-label="Render preview"
                                aria-busy={state.isRendering}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                                style={{
                                    background: state.isRendering || !state.videoPath ? V.beige : V.accent,
                                    color: state.isRendering || !state.videoPath ? V.textDim : '#fff',
                                }}>
                                {state.isRendering ? `⏳ ${state.previewStatus || 'Rendering...'}` : '▶️ Preview Result'}
                            </button>
                        </>
                    )}
                    <button onClick={state.handleDone}
                        aria-label="Apply edits and close editor"
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        style={{ background: V.pastelMint, color: '#2e7d32', border: '1px solid #94c8a0' }}>
                        ✅ Done
                    </button>
                </div>
            </div>
            <div className="flex flex-1 overflow-hidden min-h-0">
                {/* Left: Toolbar */}
                <EditorToolbar plugins={state.plugins} operations={state.operations} onAddOperation={state.handleAddOperation} />

                {/* Center: Video Preview */}
                <div className="flex-1 min-h-0 relative overflow-hidden" style={{ background: '#1a1917' }}>
                    {state.previewError && (
                        <div
                            role="alert"
                            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-2 rounded-lg text-xs max-w-[80%] text-center"
                            style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}
                        >
                            {state.previewError}
                        </div>
                    )}
                    {displaySrc ? (
                        <div className="absolute inset-0 p-3">
                            <div ref={previewViewportRef} className="relative w-full h-full">
                                <video
                                    ref={videoRef}
                                    src={displaySrc}
                                    controls
                                    className="absolute inset-0 w-full h-full"
                                    style={{ objectFit: 'contain', display: 'block' }}
                                />
                                <div
                                    className="absolute"
                                    style={{
                                        left: videoFrame.x,
                                        top: videoFrame.y,
                                        width: videoFrame.w,
                                        height: videoFrame.h,
                                    }}>
                                    <KonvaCanvasSurface
                                        videoWidth={videoDims.w}
                                        videoHeight={videoDims.h}
                                        operation={state.selectedOperation}
                                        plugin={state.selectedPlugin}
                                        operations={state.operations}
                                        onUpdateParams={state.handleUpdateParams}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <button onClick={state.handleUploadVideo}
                                aria-label="Choose a source video file"
                                className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl cursor-pointer transition-all"
                                style={{ background: `${V.card}cc`, border: `2px dashed ${V.beige}` }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = V.accent)}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = V.beige)}>
                                <span className="text-4xl">🎥</span>
                                <span className="text-sm font-bold" style={{ color: V.charcoal }}>Choose a video file</span>
                                <span className="text-xs" style={{ color: V.textDim }}>MP4, MOV, AVI, MKV, WebM</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Right: Properties */}
                <div className="shrink-0 flex flex-col min-h-0" style={{ width: 320 }}>
                    <div className="flex-1 min-h-0">
                        <EditorProperties
                            operation={state.selectedOperation}
                            plugin={state.selectedPlugin}
                            sourceAspect={videoDims.w > 0 && videoDims.h > 0 ? (videoDims.w / videoDims.h) : null}
                            onUpdateParams={state.handleUpdateParams}
                            onToggleEnabled={state.handleToggleEnabled}
                            onRemoveOperation={state.handleRemoveOperation}
                        />
                    </div>
                    <EditorTracePanel rows={state.traceLogs} isRendering={state.isRendering} previewStatus={state.previewStatus} />
                </div>
            </div>

            {/* Bottom: Timeline */}
            <EditorTimeline
                operations={state.operations}
                plugins={state.plugins}
                duration={timelineDuration}
                currentTime={state.currentTime}
                selectedOpId={state.selectedOpId}
                onSeek={(t) => {
                    state.handleSeek(t)
                    if (videoRef.current) videoRef.current.currentTime = t
                }}
                onSelectOperation={state.handleSelectOperation}
            />
        </div>
    )
}
