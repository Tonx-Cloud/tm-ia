import { t, type Locale } from '@/i18n'
import { AutostartSettings } from './AutostartSettings'

type Props = {
  locale?: Locale
  onNewProject: () => void
}

export function FirstRunEmptyState({ locale = 'en', onNewProject }: Props) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '80vh',
      padding: '24px',
      position: 'relative'
    }}>
      {/* 1. Visual Anchor */}
      <div style={{
        width: '80px',
        height: '80px',
        background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '40px',
        marginBottom: '32px',
        boxShadow: '0 10px 30px -10px rgba(124, 58, 237, 0.5)',
      }}>
        ✨
      </div>
      
      {/* 2. Value Proposition */}
      <h1 style={{ 
        fontSize: '3rem', 
        fontWeight: 800, 
        textAlign: 'center',
        marginBottom: '16px',
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
        background: 'var(--accent-gradient)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        {t('copy.hero_title', locale)}
      </h1>
      
      <p style={{ 
        fontSize: '1.125rem',
        color: 'var(--text-muted)',
        textAlign: 'center',
        maxWidth: '480px',
        marginBottom: '48px',
        lineHeight: 1.6
      }}>
        {t('copy.hero_sub', locale)}
      </p>

      {/* 3. Primary Action Area */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
        maxWidth: '320px'
      }}>
        <button 
          className="btn-primary" 
          onClick={onNewProject}
          style={{ 
            width: '100%',
            height: '56px',
            fontSize: '1.1rem',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            boxShadow: '0 4px 20px rgba(124, 58, 237, 0.25)'
          }}
        >
          <span>{t('cta.create_demo', locale)}</span>
          <span style={{ fontSize: '1.2em' }}>➜</span>
        </button>

        <div style={{
          display: 'flex',
          gap: '24px',
          fontSize: '0.875rem',
          color: 'var(--text-muted)',
          opacity: 0.8
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>⚡ 5s Preview</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>🎨 AI Gen</span>
        </div>
      </div>

      {/* 4. Footer / Settings */}
      <div style={{
        position: 'absolute',
        bottom: '32px',
        opacity: 0.7,
        transform: 'scale(0.9)'
      }}>
        <div style={{ 
          background: 'var(--surface)', 
          padding: '8px 16px', 
          borderRadius: '99px',
          border: '1px solid var(--border)' 
        }}>
           <AutostartSettings simpleMode />
        </div>
      </div>
    </div>
  )
}
