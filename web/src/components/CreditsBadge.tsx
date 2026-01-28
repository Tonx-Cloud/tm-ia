import type { FC } from 'react'
import { t, type Locale } from '@/i18n'

type Props = {
  locale?: Locale
  balance: number | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClick?: () => void
}

export const CreditsBadge: FC<Props> = ({ locale = 'en', balance, loading, error, onRetry, onClick }) => {
  if (loading) {
    return (
      <div className="balance-chip" aria-busy="true">
        <span>{t('credits.loading', locale)}</span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="balance-chip" style={{ gap: 8 }}>
        <span>{t('credits.error', locale)}</span>
        <button className="btn-ghost" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  }

  const lowBalance = (balance ?? 0) < 100
  
  return (
    <div 
      className="balance-chip" 
      onClick={onClick}
      style={{ 
        cursor: onClick ? 'pointer' : 'default',
        borderColor: lowBalance ? '#ff6b6b' : undefined,
        backgroundColor: lowBalance ? 'rgba(255,107,107,0.1)' : undefined
      }}
    >
      <span style={{ color: lowBalance ? '#ff6b6b' : undefined }}>
        {t('credits.balance', locale).replace('{{count}}', String(balance ?? 0))}
      </span>
      {lowBalance && (
        <span style={{ 
          fontSize: '0.7em', 
          background: '#ff6b6b', 
          color: 'white', 
          padding: '1px 4px', 
          borderRadius: 4,
          marginLeft: 4 
        }}>
          LOW
        </span>
      )}
    </div>
  )
}
