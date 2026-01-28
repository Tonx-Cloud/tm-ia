import { useEffect, useState } from 'react'
import { t, type Locale } from '@/i18n'

type Props = {
  token: string
  locale: Locale
}

type Payment = {
  paymentId: string
  status: string
  amount: number
  createdAt: number
}

export function PaymentHistory({ token, locale }: Props) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE || ''}/api/payments/history`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.payments) setPayments(data.payments)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="badge-soft">{t('state.processing', locale)}</div>
  if (payments.length === 0) return <div style={{ opacity: 0.5, fontSize: '0.9em' }}>{t('history.empty', locale)}</div>

  return (
    <div style={{ display: 'grid', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
      {payments.map(p => (
        <div key={p.paymentId} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, fontSize: '0.9em' }}>
          <div>
            <div style={{ fontWeight: 'bold' }}>R$ {p.amount.toFixed(2)}</div>
            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
              {new Date(p.createdAt).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US')}
            </div>
          </div>
          <div className="badge-soft" style={{
            background: p.status === 'confirmed' ? 'var(--primary)' : 'var(--bg-card)',
            color: p.status === 'confirmed' ? '#000' : 'var(--text)'
          }}>
            {t(`pix.${p.status}` as any, locale) || p.status}
          </div>
        </div>
      ))}
    </div>
  )
}
