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
    <div className="shrink-0 border-t rounded-b-2xl overflow-hidden" style={{ borderColor: V.beige, background: '#0f172a', height: 192 }}>
      <div className="h-8 px-3 flex items-center justify-between border-b" style={{ borderColor: '#243247' }}>
        <p className="text-[10px] font-bold tracking-wide uppercase" style={{ color: '#9db1ca' }}>Render Trace</p>
        <span className="text-[10px] font-mono" style={{ color: isRendering ? '#67e8f9' : '#8ea1ba' }}>
          {isRendering ? (previewStatus || 'Rendering...') : 'Idle'}
        </span>
      </div>
      <div className="h-[calc(100%-32px)] overflow-auto px-2 py-1.5 flex flex-col gap-1">
        {view.length === 0 && (
          <p className="text-[10px] px-1" style={{ color: '#7b90ac' }}>No trace events yet.</p>
        )}
        {view.map((row, idx) => (
          <div key={`${row.ts}_${idx}`} className="text-[10px] font-mono leading-snug px-1">
            <span style={{ color: '#7b90ac' }}>[{formatTs(row.ts)}]</span>{' '}
            <span style={{ color: row.level === 'error' ? '#f87171' : row.level === 'warn' ? '#fbbf24' : '#d4e2f2' }}>
              {row.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
