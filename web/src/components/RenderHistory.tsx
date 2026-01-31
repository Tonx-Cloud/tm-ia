import { useEffect, useMemo, useState } from 'react'
import { t, type Locale } from '@/i18n'

type RenderJob = {
  renderId: string
  projectId: string
  configId: string
  status: 'pending' | 'processing' | 'complete' | 'failed'
  progress: number
  outputUrl?: string
  error?: string
  createdAt: number
  updatedAt: number
}

type Props = {
  locale?: Locale
  token: string
  projectId?: string
}

const filters = ['all', 'pending', 'complete', 'failed'] as const

export function RenderHistory({ locale = 'en', token, projectId }: Props) {
  const [items, setItems] = useState<RenderJob[]>([])
  const [filter, setFilter] = useState<(typeof filters)[number]>('all')
  const [loading, setLoading] = useState(false)

  const hasActive = useMemo(() => items.some((i) => i.status === 'pending' || i.status === 'processing'), [items])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/render/history${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch history')
      const body = await res.json()
      setItems(body.renders || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [token])

  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(fetchHistory, 5000)
    return () => clearInterval(id)
  }, [hasActive])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'pending') return items.filter((i) => i.status === 'pending' || i.status === 'processing')
    if (filter === 'complete') return items.filter((i) => i.status === 'complete')
    if (filter === 'failed') return items.filter((i) => i.status === 'failed')
    return items
  }, [items, filter])

  const badgeColor = (status: RenderJob['status']) => {
    if (status === 'complete') return '#2ecc71'
    if (status === 'failed') return '#ff4d6d'
    if (status === 'processing') return '#3498db'
    return '#f1c40f'
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleString()

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800 }}>{t('history.title', locale)}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map((f) => (
            <button
              key={f}
              className="btn-ghost"
              style={{ borderColor: f === filter ? 'var(--accent)' : 'var(--border)', color: f === filter ? '#fff' : 'var(--text-muted)' }}
              onClick={() => setFilter(f)}
            >
              {t(`history.filter.${f}`, locale)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="badge-soft" style={{ marginTop: 8 }}>{t('state.processing', locale)}</div>}

      {filtered.length === 0 && !loading && (
        <div className="card" style={{ marginTop: 12 }}>
          {t('history.empty', locale)}
        </div>
      )}

      <div className="history-grid" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {filtered.map((job) => (
          <div key={job.renderId} className="card" style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{job.renderId}</div>
              <div className="badge-soft" style={{ background: badgeColor(job.status), color: '#000', border: 'none' }}>
                {t(`history.status.${job.status}`, locale)}
              </div>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('history.date', locale).replace('{{date}}', formatDate(job.createdAt))}</div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${job.progress}%`,
                  height: '100%',
                  background: 'var(--accent-gradient)',
                  transition: 'width 300ms ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {job.outputUrl && job.status === 'complete' && (
                <a className="btn-primary" href={job.outputUrl} target="_blank" rel="noreferrer">
                  {t('history.action.download', locale)}
                </a>
              )}
              {job.status === 'failed' && <button className="btn-ghost">{t('history.action.retry', locale)}</button>}
              <button className="btn-ghost">{t('history.action.details', locale)}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
