import { useMemo, useState } from 'react'
import { t, type Locale } from '@/i18n'
import { RenderProgress } from '@/components/RenderProgress'
import { CostConfirmation } from '@/components/CostConfirmation'

const formats = ['MP4', 'WebM', 'MOV'] as const
const qualities = ['720p', '1080p', '4K'] as const
const aspects = ['16:9', '9:16', '1:1'] as const

type Props = {
  locale?: Locale
  credits?: number
  token?: string
  projectId?: string | null
  onStart?: (payload: { renderId: string; cost: number; downloadUrl?: string }) => void
  onError?: (msg: string) => void
  onTopUp?: () => void
}

// Simple local estimate for UI feedback (matches api/_lib/pricing.ts RENDER_PER_MINUTE)
function estimateCost(duration: number, quality: string) {
  const minutes = Math.ceil(duration / 60)
  let cost = minutes * 100 // 100 credits per minute
  
  if (quality === '4K') {
    cost += 200 // 4K export premium
  }
  
  return cost
}

export function ProRenderConfig({ locale = 'en', credits: _credits, token, projectId, onStart, onError, onTopUp }: Props) {
  const [format, setFormat] = useState<(typeof formats)[number]>('MP4')
  const [duration, setDuration] = useState<number>(30)
  const [scenesCount, setScenesCount] = useState<number>(8)
  const [stylePrompt, setStylePrompt] = useState('Cinematic, neon, dynamic camera')
  const [aspect, setAspect] = useState<(typeof aspects)[number]>('16:9')
  const [quality, setQuality] = useState<(typeof qualities)[number]>('1080p')
  const [loading, setLoading] = useState(false)
  const [renderId, setRenderId] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const estimate = useMemo(() => estimateCost(duration, quality), [duration, quality])

  const handleStart = async () => {
    if (!projectId || !token) return
    setLoading(true)
    setDownloadUrl(null)
    try {
      // salvar config
      const cfgRes = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/render/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId,
          format,
          duration,
          scenesCount,
          stylePrompt,
          aspectRatio: aspect,
          quality,
        }),
      })
      if (!cfgRes.ok) {
        const err = await cfgRes.json().catch(() => ({}))
        throw new Error(err.error || 'Config failed')
      }
      const cfgBody = await cfgRes.json()
      const configId = cfgBody.configId as string

      // iniciar pro render
      const renderRes = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/render/pro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, configId }),
      })
      if (!renderRes.ok) {
        const err = await renderRes.json().catch(() => ({}))
        throw new Error(err.error || 'Render failed')
      }
      const renderBody = await renderRes.json()
      const rid = renderBody.renderId || configId
      setRenderId(rid)
      onStart?.({ renderId: rid, cost: renderBody.cost, downloadUrl: undefined })
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 800 }}>{t('render.config.title', locale)}</div>
        <div className="badge-soft">{t('render.config.estimate', locale).replace('{{credits}}', String(estimate))}</div>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          {t('render.config.format', locale)}
          <select value={format} onChange={(e) => setFormat(e.target.value as (typeof formats)[number])}>
            {formats.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          {t('render.config.duration', locale)}
          <input
            type="range"
            min={15}
            max={120}
            step={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
          <div className="badge-soft">{duration}s</div>
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          {t('render.config.scenes', locale)}
          <input
            type="number"
            min={4}
            max={24}
            value={scenesCount}
            onChange={(e) => setScenesCount(Math.min(24, Math.max(4, Number(e.target.value) || 4)))}
          />
        </label>

        <label style={{ display: 'grid', gap: 4 }}>
          {t('render.config.style', locale)}
          <textarea
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="Optional"
            style={{ minHeight: 80 }}
          />
        </label>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('render.config.aspect', locale)}
            <select value={aspect} onChange={(e) => setAspect(e.target.value as (typeof aspects)[number])}>
              {aspects.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            {t('render.config.quality', locale)}
            <select value={quality} onChange={(e) => setQuality(e.target.value as (typeof qualities)[number])}>
              {qualities.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button 
          className="btn-primary" 
          disabled={loading || !projectId} 
          onClick={() => setConfirmOpen(true)}
        >
          {loading ? t('state.processing', locale) : t('render.config.start', locale)}
        </button>

        {renderId && token && (
          <RenderProgress
            renderId={renderId}
            token={token}
            onComplete={(url) => {
              setDownloadUrl(url || null)
            }}
          />
        )}
        {downloadUrl && (
          <a className="btn-primary" href={downloadUrl} target="_blank" rel="noreferrer">
            Download (mock)
          </a>
        )}
      </div>

      <CostConfirmation
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleStart}
        onTopUp={onTopUp}
        token={token}
        title="Start Render"
        action="render"
        renderConfig={{
          newImages: 0,
          animationSeconds: 0,
          durationMinutes: duration / 60,
          quality: quality === '4K' ? '4k' : 'hd',
          removeWatermark: false
        }}
      />
    </section>
  )
}
