import { V } from './types'
import type { ReactElement } from 'react'

interface TraceRow {
  ts: number
  level: 'info' | 'warn' | 'error'
  message: string
}

interface EditorTracePanelProps {
  rows: TraceRow[]
  isRendering: boolean
  previewStatus: string | null
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function EditorTracePanel({ rows, isRendering, previewStatus }: EditorTracePanelProps): ReactElement {
  const view = rows.slice(-80)
  return (
    <div className="shrink-0 border-t" style={{ borderColor: V.beige, background: V.cream, height: 180 }}>
      <div className="h-7 px-3 flex items-center justify-between border-b" style={{ borderColor: V.beige }}>
        <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: V.textDim }}>Trace</p>
        <span className="text-[10px] font-mono" style={{ color: isRendering ? V.accent : V.textDim }}>
          {isRendering ? (previewStatus || 'Rendering...') : 'Idle'}
        </span>
      </div>
      <div className="h-[calc(100%-28px)] overflow-auto px-2 py-1.5 flex flex-col gap-1">
        {view.length === 0 && (
          <p className="text-[10px] px-1" style={{ color: V.textDim }}>No trace events yet.</p>
        )}
        {view.map((row, idx) => (
          <div key={`${row.ts}_${idx}`} className="text-[10px] font-mono leading-snug px-1">
            <span style={{ color: V.textDim }}>[{formatTs(row.ts)}]</span>{' '}
            <span style={{ color: row.level === 'error' ? '#dc2626' : row.level === 'warn' ? '#b45309' : V.charcoal }}>
              {row.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
