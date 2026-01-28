import type { ReactNode } from 'react'
import { t, type Locale } from '@/i18n'
import { CreditsBadge } from '@/components/CreditsBadge'
import '@/styles/theme.css'

type ShellProps = {
  locale?: Locale
  balance?: number | null
  balanceLoading?: boolean
  balanceError?: string | null
  onRetryBalance?: () => void
  onBalanceClick?: () => void
  onLocaleChange?: (locale: Locale) => void
  onNavigate?: (route: string) => void
  onLogout?: () => void
  children: ReactNode
}


const locales: Locale[] = ['en', 'pt']

export function Shell({ locale = 'en', balance = 0, balanceLoading = false, balanceError = null, onRetryBalance, onBalanceClick, onLocaleChange, onNavigate, onLogout, children }: ShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-text">AI Music Video</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CreditsBadge
            locale={locale}
            balance={balance}
            loading={balanceLoading}
            error={balanceError}
            onRetry={onRetryBalance || (() => {})}
            onClick={onBalanceClick}
          />
          <div className="badge-soft" style={{ display: 'flex', gap: 8 }}>
            {locales.map((lc) => (
              <button
                key={lc}
                className="btn-ghost"
                style={{
                  padding: '6px 10px',
                  borderColor: lc === locale ? 'var(--accent)' : 'var(--border)',
                  color: lc === locale ? '#fff' : 'var(--text-muted)',
                }}
                onClick={() => onLocaleChange?.(lc)}
              >
                {lc.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="layout-main">
        <aside className="sidebar">
          <button className="nav-item" onClick={() => onNavigate?.('home')}>
            Home
          </button>
          <button className="nav-item" onClick={() => onNavigate?.('editor')}>
            Editor
          </button>
          <button className="nav-item" onClick={() => onNavigate?.('history')}>
            {t('nav.history', locale)}
          </button>
          <div className="nav-item">{t('nav.inspo', locale)}</div>
          
          {onLogout && (
            <button 
              className="nav-item" 
              onClick={onLogout}
              style={{ marginTop: 'auto', color: 'var(--text-muted)' }}
            >
              {t('nav.logout', locale)}
            </button>
          )}
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
