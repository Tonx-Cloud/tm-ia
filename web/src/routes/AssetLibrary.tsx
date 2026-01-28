import { useEffect, useMemo, useState } from 'react'
import { t, type Locale } from '@/i18n'
import { regenAsset, reuseAsset, type Asset } from '@/lib/assetsApi'
import { CostConfirmation } from '@/components/CostConfirmation'

interface Props {
  assets: Asset[]
  creditsEstimate?: number
  projectId?: string | null
  token?: string
  locale?: Locale
  onUpdate?: (assets: Asset[]) => void
  onError?: (msg: string) => void
  onDebited?: (amount: number) => void
  onTopUp?: () => void
}

export function AssetLibrary({ assets, creditsEstimate, projectId, token, locale = 'en', onUpdate, onError, onDebited, onTopUp }: Props) {
  const [items, setItems] = useState<Asset[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [lastCost, setLastCost] = useState<number | null>(null)
  const [confirmRegenId, setConfirmRegenId] = useState<string | null>(null)

  useEffect(() => {
    setItems(assets)
  }, [assets])

  const handleReuse = async (id: string) => {
    if (!projectId || !token) return
    try {
      setLoadingId(id)
      const resp = await reuseAsset(projectId, id, token)
      setItems(resp.project.assets)
      onUpdate?.(resp.project.assets)
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setLoadingId(null)
    }
  }

  const handleRegen = async () => {
    const id = confirmRegenId
    if (!id || !projectId || !token) return
    
    try {
      setLoadingId(id)
      const resp = await regenAsset(projectId, id, token)
      setItems(resp.project.assets)
      onUpdate?.(resp.project.assets)
      const cost = (resp as any).cost ?? 30
      setLastCost(cost)
      onDebited?.(cost)
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setLoadingId(null)
      setConfirmRegenId(null)
    }
  }

  const badges = useMemo(() => {
    return {
      reuse: t('assets.reuse_badge', locale),
      estimate: t('assets.estimate_badge', locale),
      status: {
        generated: t('assets.status.generated', locale),
        reused: t('assets.status.reused', locale),
        needs_regen: t('assets.status.needs_regen', locale),
        needs_regen_placeholder: t('assets.status.needs_regen', locale),
      },
    }
  }, [locale])

  return (
    <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>{t('assets.title', locale)}</div>
          <div className="badge-soft">{badges.reuse}</div>
          {creditsEstimate !== undefined && <div className="badge-soft">{badges.estimate.replace('{count}', String(creditsEstimate))}</div>}
          {lastCost !== null && <div className="badge-soft">{t('assets.cost.last', locale).replace('{count}', String(lastCost))}</div>}
        </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
        {items.map((a) => (
          <div
            key={a.id}
            className="card"
            style={{
              padding: 10,
              position: 'relative',
              borderColor: a.status === 'needs_regen' ? '#ff4d6d' : undefined,
            }}
          >
            <div style={{ position: 'absolute', top: 8, right: 8 }} className="badge-soft">
              {badges.status[a.status] ?? a.status}
            </div>
            <div
              style={{
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                height: 120,
                background: a.dataUrl
                  ? `center / cover url(${a.dataUrl})`
                  : 'linear-gradient(120deg, rgba(180,59,255,0.1), rgba(15,16,23,0.9))',
              }}
            />
            <div style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>{a.prompt}</div>
            {a.status === 'needs_regen' && (
              <div className="badge-soft" style={{ marginTop: 6, borderColor: '#ff4d6d', color: '#ffb3c0' }}>
                {t('assets.needs_regen.hint', locale)}
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button className="btn-ghost" disabled={!!loadingId} onClick={() => handleReuse(a.id)}>
                {t('assets.cta.reuse', locale)}
              </button>
              <button
                className="btn-primary"
                disabled={!!loadingId}
                onClick={() => setConfirmRegenId(a.id)}
              >
                {a.status === 'needs_regen'
                  ? t('assets.cta.regen_now', locale)
                  : t('assets.cta.regen', locale)}
              </button>
            </div>
          </div>
        ))}
      </div>

      <CostConfirmation
        open={!!confirmRegenId}
        onClose={() => setConfirmRegenId(null)}
        onConfirm={handleRegen}
        onTopUp={onTopUp}
        token={token}
        title="Regenerate Image"
        action="REGENERATE_IMAGE"
        quantity={1}
      />
    </section>
  )
}
