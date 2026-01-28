import { useEffect, useMemo, useState } from 'react'
import { t, type Locale } from '@/i18n'
import type { DemoStatus } from '@/lib/api'

type Props = {
  locale?: Locale
  demoStatus?: DemoStatus
  metadata?: {
    title?: string
    duration?: string
    format?: 'vertical' | 'horizontal' | 'square'
    hook?: string
    hookWindow?: string
    mood?: string
    genre?: string
    previewDataUrl?: string
  }
  credits?: number
  cost?: number
  onTopUp?: () => void
  onUnlock?: () => void
  unlocking?: boolean
}

const bullets = ['paywall.point_full', 'paywall.point_no_watermark', 'paywall.point_multi_scene'] as const
type BulletKey = (typeof bullets)[number]

export function PreviewPaywall({ locale = 'en', demoStatus, metadata, credits = 0, cost = 8, onTopUp, onUnlock, unlocking }: Props) {
  const isReady = demoStatus === 'ready'
  const required = cost ?? 0
  const hasCredits = credits >= required
  const missing = Math.max(0, required - credits)
  const previewUrl = metadata?.previewDataUrl
  const [isMobile, setIsMobile] = useState<boolean>(() => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 720px)')
    const handler = () => setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleUnlock = () => {
    if (!isReady) return
    if (!hasCredits) {
      onTopUp?.()
      return
    }
    onUnlock?.()
  }

  const ctaLabel = useMemo(() => {
    const base = t('preview.unlock.cta', locale)
    return `${base} - ${t('preview.unlock.cost', locale).replace('{{count}}', String(required))}`
  }, [required, locale])

  const neededLabel = t('preview.credits.needed', locale).replace('{{count}}', String(required))
  const availableLabel = t('preview.credits.available', locale).replace('{{count}}', String(credits))
  const primaryDisabled = !isReady || unlocking

  return (
    <section className="card" style={{ marginTop: 16, position: 'relative', overflow: 'hidden' }}>
      <div className="badge-soft" style={{ marginBottom: 12 }}>
        {t('badge.demo_disclaimer', locale)}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: previewUrl ? '#05060c' : 'linear-gradient(120deg, rgba(180,59,255,0.08), rgba(15,16,23,0.9))',
          }}
        >
          {previewUrl ? (
            <video
              src={previewUrl}
              controls
              style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: 420 }}
              poster={previewUrl}
            />
          ) : (
            <div style={{ padding: 28, color: 'var(--text-muted)', textAlign: 'center' }}>
              {isReady ? t('state.waiting_demo', locale) : t('state.processing', locale)}
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              padding: '6px 10px',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.65)',
              color: '#fff',
              fontSize: 12,
              letterSpacing: 0.4,
            }}
          >
            {t('preview.watermark.badge', locale)}
          </div>
          {previewUrl && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                padding: '6px 10px',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                borderRadius: 10,
                fontSize: 12,
              }}
            >
              {t('preview.hero.subtitle', locale)}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div className="badge-soft">{t('preview.hero.title', locale)}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{metadata?.title ?? t('preview.hero.subtitle', locale)}</div>
          <div style={{ color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge-soft">{t('label.track', locale)}: {metadata?.title ?? '—'}</span>
            <span className="badge-soft">{t('label.duration', locale)}: {metadata?.duration ?? '5s demo'}</span>
            <span className="badge-soft">{t('label.format', locale)}: {metadata?.format ?? 'vertical'}</span>
          </div>
          {metadata?.hook && (
            <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('demo.hook.title', locale)}</div>
              <div style={{ color: 'var(--text-muted)' }}>
                “{metadata.hook}” {metadata.hookWindow ? `(${metadata.hookWindow})` : ''}
              </div>
            </div>
          )}

          <div className="card" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800 }}>{t('preview.unlock.title', locale)}</div>
            <div style={{ color: 'var(--text-muted)' }}>{t('preview.unlock.subtitle', locale)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge-soft">{neededLabel}</span>
              <span className="badge-soft">{availableLabel}</span>
            </div>
            {!hasCredits && (
              <div style={{ color: '#ffb3c0' }}>
                {t('preview.unlock.missing', locale).replace('{{count}}', String(missing))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                style={{ flex: 1, minWidth: 180, fontSize: 16, padding: '12px 14px' }}
                disabled={primaryDisabled}
                onClick={handleUnlock}
              >
                {unlocking ? t('state.processing', locale) : ctaLabel}
              </button>
              <button className="btn-ghost" type="button" onClick={onTopUp} disabled={unlocking}>
                {t('cta.buy_credits', locale)}
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-muted)' }}>
              {bullets.map((key: BulletKey) => (
                <li key={key} style={{ marginBottom: 6 }}>
                  {t(key, locale as never)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {isMobile && isReady && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '12px 14px',
            background: 'linear-gradient(180deg, rgba(5,6,12,0.2) 0%, rgba(5,6,12,0.9) 45%, rgba(5,6,12,1) 100%)',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gap: 8,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }}>
            <span>{neededLabel}</span>
            <span>{availableLabel}</span>
          </div>
          <button
            className="btn-primary"
            style={{ width: '100%', padding: '12px 14px', fontSize: 16 }}
            disabled={primaryDisabled}
            onClick={handleUnlock}
          >
            {unlocking ? t('state.processing', locale) : ctaLabel}
          </button>
          {!hasCredits && (
            <button className="btn-ghost" type="button" onClick={onTopUp} disabled={unlocking}>
              {t('cta.top_up', locale)}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
