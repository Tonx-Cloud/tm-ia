import { useState } from 'react'
import { t, type Locale } from '@/i18n'
import { CreditPackages } from '@/components/CreditPackages'
import { PaymentHistory } from '@/components/PaymentHistory'

type Props = {
  locale?: Locale
  open: boolean
  onClose: () => void
  token?: string
  onAdded?: (amount: number, balance: number) => void
}

export function TopUpModal({ locale = 'en', open, onClose, token, onAdded }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'buy' | 'history'>('buy')

  if (!open) return null

  const handleBuyPackage = async (packageId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/credits/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Send mock=true for dev testing immediately
        body: JSON.stringify({ packageId, mock: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Top-up failed')
      }
      const body = await res.json()
      
      // If it's a real payment init (not mock), handle redirect or QR code here.
      // For now we assume mock or immediate success.
      if (body.mock || body.ok) {
        onAdded?.(body.added, body.balance)
        onClose()
      } else if (body.paymentUrl) {
         window.location.href = body.paymentUrl
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <div style={{ fontWeight: 700 }}>{t('credits.topup.title', locale)}</div>
          <button className="btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <button 
            className="btn-ghost" 
            style={{ borderBottom: tab === 'buy' ? '2px solid var(--primary)' : 'none', borderRadius: 0, padding: '8px 16px' }}
            onClick={() => setTab('buy')}
          >
            {t('credits.topup.title', locale) || 'Top-up'}
          </button>
          <button 
            className="btn-ghost" 
            style={{ borderBottom: tab === 'history' ? '2px solid var(--primary)' : 'none', borderRadius: 0, padding: '8px 16px' }}
            onClick={() => setTab('history')}
          >
            {locale === 'pt' ? 'Histórico' : 'History'}
          </button>
        </div>

        {tab === 'buy' ? (
          <div className="modal-body">
             {error && <div className="badge-soft" style={{ color: '#ffb3c0', marginBottom: 16 }}>{error}</div>}
             <CreditPackages 
               token={token} 
               onSelectPackage={handleBuyPackage} 
               loading={loading}
             />
          </div>
        ) : (
          <div className="modal-body">
            {token ? <PaymentHistory token={token} locale={locale} /> : <div>Login required</div>}
          </div>
        )}
      </div>
    </div>
  )
}
