/**
 * Video Editor Window — CapCut-Style Layout
 * ──────────────────────────────────────────
 * Thin composition layer: uses useEditorState hook + sub-components.
 * Layout: Left toolbar | Center preview | Right properties | Bottom timeline
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { useEditorState } from './useEditorState'
import { EditorToolbar } from './EditorToolbar'
import { EditorProperties } from './EditorProperties'
import { EditorTimeline } from './EditorTimeline'
import { CanvasOverlay } from './CanvasOverlay'
import { V } from './types'

export default function VideoEditorWindow() {
    const state = useEditorState()
    const videoRef = useRef<HTMLVideoElement>(null)
    const previewContainerRef = useRef<HTMLDivElement>(null)
    const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })

    // Sync video duration + currentTime
    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const onMeta = () => state.handleSeek(0)
        const onTime = () => state.handleSeek(video.currentTime)
        video.addEventListener('loadedmetadata', onMeta)
        video.addEventListener('timeupdate', onTime)
        return () => {
            video.removeEventListener('loadedmetadata', onMeta)
            video.removeEventListener('timeupdate', onTime)
        }
    }, [state.videoSrc])

    // Track displayed video element size for canvas overlay
    const updateVideoDims = useCallback(() => {
        const video = videoRef.current
        if (!video) { setVideoDims({ w: 0, h: 0 }); return }
        setVideoDims({ w: video.clientWidth, h: video.clientHeight })
    }, [])

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const ro = new ResizeObserver(updateVideoDims)
        ro.observe(video)
        video.addEventListener('loadedmetadata', updateVideoDims)
        return () => { ro.disconnect(); video.removeEventListener('loadedmetadata', updateVideoDims) }
    }, [state.videoSrc, updateVideoDims])

    const displaySrc = state.previewSrc || state.videoSrc

    return (
        <div className="video-editor-shell flex flex-col h-screen w-screen" style={{ background: V.bg }}>
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
                        <button onClick={() => state.handlePreview()}
                            disabled={state.isRendering}
                            aria-label="Render preview"
                            aria-busy={state.isRendering}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                            style={{
                                background: state.isRendering ? V.beige : V.accent,
                                color: state.isRendering ? V.textDim : '#fff',
                            }}>
                            {state.isRendering ? '⏳ Rendering...' : '▶️ Preview Result'}
                        </button>
                    )}
                    <button onClick={state.handleDone}
                        aria-label="Apply edits and close editor"
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        style={{ background: V.pastelMint, color: '#2e7d32', border: '1px solid #94c8a0' }}>
                        ✅ Done
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Toolbar */}
                <EditorToolbar plugins={state.plugins} onAddOperation={state.handleAddOperation} />

                {/* Center: Video Preview */}
                <div ref={previewContainerRef}
                    className="flex-1 flex items-center justify-center relative overflow-hidden"
                    style={{ background: '#1a1917' }}>
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
                        <div className="relative" style={{ display: 'inline-block' }}>
                            <video
                                ref={videoRef}
                                src={displaySrc}
                                controls
                                className="max-w-full max-h-full"
                                style={{ objectFit: 'contain', display: 'block' }}
                            />
                            <CanvasOverlay
                                videoWidth={videoDims.w}
                                videoHeight={videoDims.h}
                                operation={state.selectedOperation}
                                plugin={state.selectedPlugin}
                                onUpdateParams={state.handleUpdateParams}
                            />
                        </div>
                    ) : (
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
                    )}
                </div>

                {/* Right: Properties */}
                <div className="shrink-0 overflow-y-auto" style={{ width: 280 }}>
                    <EditorProperties
                        operation={state.selectedOperation}
                        plugin={state.selectedPlugin}
                        onUpdateParams={state.handleUpdateParams}
                        onToggleEnabled={state.handleToggleEnabled}
                        onRemoveOperation={state.handleRemoveOperation}
                    />
                </div>
            </div>

            {/* Bottom: Timeline */}
            <EditorTimeline
                operations={state.operations}
                plugins={state.plugins}
                duration={videoRef.current?.duration || 30}
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
