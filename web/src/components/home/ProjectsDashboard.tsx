import { t, type Locale } from '@/i18n'

type Props = {
  locale?: Locale
  lastProjectId?: string | null
  onContinue: () => void
  onNewProject: () => void
}

export function ProjectsDashboard({ locale = 'en', lastProjectId, onContinue, onNewProject }: Props) {
  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>
            {locale === 'pt' ? 'Meus Projetos' : 'My Projects'}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {locale === 'pt' ? 'Continue de onde parou ou comece algo novo.' : 'Pick up where you left off or start fresh.'}
          </p>
        </div>
        <button className="btn-primary" onClick={onNewProject}>
          + {t('cta.create_demo', locale)}
        </button>
      </header>

      {lastProjectId && (
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-secondary)' }}>
            {locale === 'pt' ? 'Continuar Editando' : 'Continue Editing'}
          </h2>
          <div className="card" style={{ 
            display: 'flex', 
            gap: '24px', 
            padding: '24px',
            alignItems: 'center',
            background: 'linear-gradient(120deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
            borderColor: 'var(--accent)'
          }}>
            <div style={{ 
              width: '160px', 
              height: '90px', 
              borderRadius: '8px', 
              background: 'var(--accent-gradient)',
              display: 'grid',
              placeItems: 'center',
              fontSize: '2rem'
            }}>
              🎵
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {locale === 'pt' ? 'Projeto Recente' : 'Recent Project'}
                </h3>
                <span className="badge-soft">Edited just now</span>
              </div>
              <p style={{ color: 'var(--text-muted)' }}>ID: {lastProjectId}</p>
            </div>
            <button 
              className="btn-primary" 
              onClick={onContinue}
              style={{ padding: '12px 24px', fontSize: '1.1rem' }}
            >
              {locale === 'pt' ? 'Abrir Editor' : 'Open Editor'} ➜
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px', color: 'var(--text-secondary)' }}>
          {locale === 'pt' ? 'Histórico' : 'History'}
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Skeleton / Empty State for history list */}
          <div className="card" style={{ opacity: 0.5, borderStyle: 'dashed' }}>
            <div style={{ height: '140px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '16px' }} />
            <div style={{ height: '20px', width: '60%', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ height: '16px', width: '40%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
          </div>
        </div>
      </section>
    </div>
  )
}
