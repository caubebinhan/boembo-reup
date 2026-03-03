/**
 * Video Editor Window — CapCut-Style Layout
 * ──────────────────────────────────────────
 * Thin composition layer: uses useEditorState hook + sub-components.
 * Layout: Left toolbar | Center preview | Right properties | Bottom timeline
 */
import { useRef, useEffect } from 'react'
import { useEditorState } from './useEditorState'
import { EditorToolbar } from './EditorToolbar'
import { EditorProperties } from './EditorProperties'
import { EditorTimeline } from './EditorTimeline'
import { V } from './types'

export default function VideoEditorWindow() {
    const state = useEditorState()
    const videoRef = useRef<HTMLVideoElement>(null)

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

    const displaySrc = state.previewSrc || state.videoSrc

    return (
        <div className="flex flex-col h-screen w-screen" style={{ background: V.bg }}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 shrink-0"
                style={{ height: 44, background: V.card, borderBottom: `1px solid ${V.beige}` }}>
                <div className="flex items-center gap-2.5">
                    <span className="text-lg">🎬</span>
                    <h1 className="text-sm font-bold" style={{ color: V.charcoal }}>Video Editor</h1>
                    {state.previewSrc && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                            style={{ background: V.pastelMint, color: '#2e7d32' }}>RENDERED</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {displaySrc && (
                        <button onClick={() => state.handlePreview()}
                            disabled={state.isRendering}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                            style={{
                                background: state.isRendering ? V.beige : V.accent,
                                color: state.isRendering ? V.textDim : '#fff',
                            }}>
                            {state.isRendering ? '⏳ Rendering...' : '▶️ Preview Result'}
                        </button>
                    )}
                    <button onClick={state.handleDone}
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
                <div className="flex-1 flex items-center justify-center relative overflow-hidden"
                    style={{ background: '#1a1917' }}>
                    {displaySrc ? (
                        <video
                            ref={videoRef}
                            src={displaySrc}
                            controls
                            className="max-w-full max-h-full"
                            style={{ objectFit: 'contain' }}
                        />
                    ) : (
                        <button onClick={state.handleUploadVideo}
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
