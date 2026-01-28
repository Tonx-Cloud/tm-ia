import { useEffect, useMemo, useState } from 'react'
import { t, type Locale } from '@/i18n'

type Props = {
  isOpen: boolean
  onClose: () => void
  amount: number
  token: string
  locale?: Locale
  onSuccess: (newBalance: number) => void
}

type Status = 'loading' | 'awaiting' | 'confirmed' | 'expired' | 'error'

export function PixPaymentModal({ isOpen, onClose, amount, token, locale = 'en', onSuccess }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [copyCode, setCopyCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [manualChecking, setManualChecking] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const start = async () => {
      setStatus('loading')
      setError(null)
      setCopied(false)
      setExpiresAt(Date.now() + 5 * 60_000)
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/payments/pix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'PIX init failed')
        }
        const body = await res.json()
        if (cancelled) return
        setPaymentId(body.paymentId)
        setQrBase64(body.qrBase64)
        setCopyCode(body.copyCode)
        setStatus('awaiting')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError((err as Error).message)
      }
    }
    start()
    return () => {
      cancelled = true
    }
  }, [isOpen, amount, token])

  useEffect(() => {
    if (!paymentId || status !== 'awaiting') return
    let stopped = false
    const poll = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/payments/status?paymentId=${paymentId}`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Status failed')
        }
        const body = await res.json()
        if (stopped) return
        if (body.status === 'confirmed') {
          setStatus('confirmed')
          onSuccess(body.balance ?? body.amount ?? amount)
          return
        }
        if (body.status === 'expired') {
          setStatus('expired')
          return
        }
        if (expiresAt && Date.now() > expiresAt) {
          setStatus('expired')
          return
        }
        setTimeout(poll, 3000)
      } catch (err) {
        if (stopped) return
        setStatus('error')
        setError((err as Error).message)
      }
    }
    poll()
    return () => {
      stopped = true
    }
  }, [paymentId, status, expiresAt, amount, onSuccess])

  const remaining = useMemo(() => {
    if (!expiresAt) return '5:00'
    const diff = Math.max(0, expiresAt - Date.now())
    const m = Math.floor(diff / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [expiresAt, status])

  const handleCopy = async () => {
    if (!copyCode) return
    try {
      await navigator.clipboard.writeText(copyCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const handleManualCheck = async () => {
    if (!paymentId || manualChecking) return
    setManualChecking(true)
    setError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/payments/status?paymentId=${paymentId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Status check failed')
      }
      const body = await res.json()
      if (body.status === 'confirmed') {
        setStatus('confirmed')
        onSuccess(body.balance ?? body.amount ?? amount)
      } else if (body.status === 'expired') {
        setStatus('expired')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setManualChecking(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div style={{ fontWeight: 800 }}>{t('pix.title', locale)}</div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gap: 12 }}>
          {status === 'loading' && <div className="badge-soft">{t('state.processing', locale)}</div>}
          {status === 'error' && <div className="badge-soft" style={{ color: '#ffb3c0' }}>{error}</div>}

          {qrBase64 && (
            <div style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
              <img
                src={`data:image/png;base64,${qrBase64}`}
                alt="PIX QR"
                style={{ width: 220, height: 220, margin: '0 auto', borderRadius: 12, border: '1px solid var(--border)' }}
              />
              <div style={{ color: 'var(--text-muted)' }}>{t('pix.scan', locale)}</div>
            </div>
          )}

          {copyCode && (
            <div className="card" style={{ display: 'grid', gap: 8 }}>
              <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{copyCode}</div>
              <button className="btn-ghost" onClick={handleCopy}>
                {copied ? t('pix.copied', locale) : t('pix.copy', locale)}
              </button>
            </div>
          )}

          {(status === 'awaiting' || status === 'loading') && (
            <div className="badge-soft">
              {t('pix.awaiting', locale)} · {t('pix.timeout', locale).replace('{{time}}', remaining)}
            </div>
          )}
          {status === 'confirmed' && <div className="badge-soft">{t('pix.confirmed', locale)}</div>}
          {status === 'expired' && <div className="badge-soft" style={{ color: '#ffb3c0' }}>{t('pix.expired', locale)}</div>}

           <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
             <button className="btn-secondary" onClick={handleManualCheck} disabled={manualChecking}>
               {manualChecking ? 'Verificando...' : 'Já paguei'}
             </button>
             <button className="btn-ghost" onClick={onClose}>{t('pix.close', locale)}</button>
           </div>
        </div>
      </div>
    </div>
  )
}
