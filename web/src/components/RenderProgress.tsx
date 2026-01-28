import { useEffect, useState } from 'react'

type Props = {
  renderId: string
  token: string
  onComplete?: (url?: string) => void
}

export function RenderProgress({ renderId, token, onComplete }: Props) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'pending' | 'processing' | 'complete' | 'failed'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    const poll = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/render/status?renderId=${renderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Status failed')
        }
        const body = await res.json()
        if (stopped) return
        setProgress(body.progress ?? 0)
        setStatus(body.status)
        if (body.outputUrl) setDownloadUrl(body.outputUrl)
        if (body.status === 'complete') {
          onComplete?.(body.outputUrl)
          return
        }
        if (body.status === 'failed') {
          setError(body.error || 'Render failed')
          return
        }
        setTimeout(poll, 2000)
      } catch (err) {
        if (stopped) return
        setError((err as Error).message)
      }
    }
    poll()
    return () => {
      stopped = true
    }
  }, [renderId, token, onComplete])

  return (
    <div className="card" style={{ padding: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Render progress</div>
        <div className="badge-soft">{status}</div>
      </div>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--accent-gradient)',
            transition: 'width 400ms ease',
          }}
        />
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{progress}%</div>
      {downloadUrl && (
        <a className="btn-primary" href={downloadUrl} target="_blank" rel="noreferrer">
          Download (mock)
        </a>
      )}
      {error && <div className="badge-soft" style={{ color: '#ffb3c0' }}>{error}</div>}
    </div>
  )
}
