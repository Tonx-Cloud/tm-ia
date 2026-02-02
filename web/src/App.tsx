import { useState, useEffect } from 'react'
import { LandingPage } from '@/components/LandingPage'
import { AuthModal } from '@/components/AuthModal'
import { StepWizard } from '@/components/StepWizard'
import { Sidebar, type SidebarSection, getSidebarWidth } from '@/components/Sidebar'
import { RenderHistory } from '@/components/RenderHistory'
import { useToaster } from '@/components/Toaster'
import { useCredits } from '@/hooks/useCredits'
import './styles/theme.css'

// ============================================================================
// PLACEHOLDER SECTIONS
// ============================================================================

function PlaceholderSection({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      padding: 40
    }}>
      <div style={{
        fontSize: 64,
        marginBottom: 24,
        filter: 'grayscale(0.3)'
      }}>
        {icon}
      </div>
      <h2 style={{
        fontSize: 28,
        fontWeight: 700,
        marginBottom: 12,
        background: 'linear-gradient(135deg, #b43bff, #3b82f6)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        {title}
      </h2>
      <p style={{
        color: 'var(--text-muted)',
        fontSize: 16,
        maxWidth: 400,
        lineHeight: 1.6,
        marginBottom: 24
      }}>
        {description}
      </p>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        background: 'rgba(180, 59, 255, 0.1)',
        border: '1px solid rgba(180, 59, 255, 0.3)',
        borderRadius: 20,
        fontSize: 13,
        color: 'var(--accent)'
      }}>
        <span>🚀</span>
        Em desenvolvimento
      </div>
    </div>
  )
}

// ============================================================================
// PROJECTS SECTION
// ============================================================================

function ProjectsSection({ token, onOpenProject }: { token: string; onOpenProject: (projectId: string) => void }) {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } })
        const body = await res.json().catch(() => ({}))
        if (!mounted) return
        setProjects(body.projects || [])
      } catch {
        if (!mounted) return
        setProjects([])
      } finally {
        if (!mounted) return
        setLoading(false)
      }
    }
    if (token) void run()
    else {
      setLoading(false)
      setProjects([])
    }
    return () => { mounted = false }
  }, [token])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Meus Projetos</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
          Gerencie seus projetos de vídeo musical
        </p>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 40
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📁</div>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Nenhum projeto ainda</h3>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', maxWidth: 300 }}>
            Crie seu primeiro vídeo musical para vê-lo aqui
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Meus Projetos</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {projects.map((project) => (
          <button
            key={project.id}
            className="card"
            onClick={() => onOpenProject(project.id)}
            style={{
              padding: 16,
              textAlign: 'left',
              cursor: 'pointer',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              color: 'inherit'
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{project.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date(project.createdAt).toLocaleDateString()} • {project.assetsCount ?? 0} cenas
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--accent)' }}>
              Abrir / Continuar →
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// HISTORY SECTION
// ============================================================================

function HistorySection({ token }: { token: string }) {
  const projectId = localStorage.getItem('tm_project_id') || ''

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Histórico de Renders</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Histórico do projeto atual
      </p>
      {!projectId ? (
        <div className="card" style={{ padding: 16 }}>
          Nenhum projeto selecionado. Abra um projeto em “Meus Projetos” ou crie um novo.
        </div>
      ) : (
        <RenderHistory token={token} locale="pt" projectId={projectId} />
      )}
    </div>
  )
}

// ============================================================================
// SETTINGS SECTION
// ============================================================================

function SettingsSection({ onLogout }: { onLogout: () => void }) {
  return (
    <div style={{ padding: 24, maxWidth: 600 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Configurações</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>
        Gerencie sua conta e preferências
      </p>

      {/* Account Section */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Conta</h3>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
          borderBottom: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ fontWeight: 500 }}>Email</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Seu email de login</div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>***@***</div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0'
        }}>
          <div>
            <div style={{ fontWeight: 500 }}>Senha</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Alterar sua senha</div>
          </div>
          <button className="btn-ghost" style={{ padding: '8px 16px', fontSize: 13 }}>
            Alterar
          </button>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Preferências</h3>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
          borderBottom: '1px solid var(--border)'
        }}>
          <div>
            <div style={{ fontWeight: 500 }}>Idioma</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Idioma da interface</div>
          </div>
          <select style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            color: 'var(--text)',
            fontSize: 13
          }}>
            <option value="pt">Português</option>
            <option value="en">English</option>
          </select>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0'
        }}>
          <div>
            <div style={{ fontWeight: 500 }}>Notificações</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Receber emails sobre novidades</div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
            <input type="checkbox" style={{ opacity: 0, width: 0, height: 0 }} defaultChecked />
            <span style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--accent)',
              borderRadius: 24,
              transition: '0.2s'
            }}>
              <span style={{
                position: 'absolute',
                content: '""',
                height: 18,
                width: 18,
                left: 22,
                bottom: 3,
                background: 'white',
                borderRadius: '50%',
                transition: '0.2s'
              }} />
            </span>
          </label>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card" style={{ padding: 20, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#ef4444' }}>Zona de Perigo</h3>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 500 }}>Sair da conta</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Encerrar sessão atual</div>
          </div>
          <button
            onClick={onLogout}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN APP
// ============================================================================

function App() {
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('tm_auth_token') || '')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [activeSection, setActiveSection] = useState<SidebarSection>('music-video')
  const [wizardKey, setWizardKey] = useState(1)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const credits = useCredits(authToken || undefined)
  const { push, ToastContainer } = useToaster()
  const isAuthenticated = !!authToken

  // Handle OAuth callback - check URL for token on mount
  useEffect(() => {
    const url = new URL(window.location.href)
    const pathname = url.pathname

    // Check if this is an OAuth callback
    if (pathname === '/auth/callback') {
      const token = url.searchParams.get('token')
      const error = url.searchParams.get('error')
      const email = url.searchParams.get('email')
      const provider = url.searchParams.get('provider')

      console.log('[OAuth Callback] Detected:', { token: token?.substring(0, 10), error, email, provider })

      if (error) {
        // Show error after a small delay to ensure toaster is ready
        setTimeout(() => {
          push({ type: 'error', text: `Erro no login: ${error}` })
        }, 100)
      } else if (token) {
        // Save token and authenticate
        localStorage.setItem('tm_auth_token', token)
        console.log('[OAuth Callback] Token saved to localStorage')
        setAuthToken(token)
        console.log('[OAuth Callback] State updated with token')

        const providerName = provider === 'google' ? 'Google' : 'email'
        setTimeout(() => {
          push({ type: 'success', text: `Login com ${providerName} realizado!${email ? ` (${email})` : ''}` })
        }, 100)
      }

      // Clean up URL - remove query params and redirect to home
      window.history.replaceState({}, '', '/')
      console.log('[OAuth Callback] URL cleaned')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run only once on mount

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleAuth = (token: string) => {
    setAuthToken(token)
    localStorage.setItem('tm_auth_token', token)
    setShowAuthModal(false)
    push({ type: 'success', text: 'Login realizado com sucesso!' })
  }

  const handleLogout = () => {
    setAuthToken('')
    localStorage.removeItem('tm_auth_token')
    setActiveSection('music-video')
    push({ type: 'info', text: 'Logout realizado.' })
  }

  const handleBuyCredits = () => {
    push({ type: 'info', text: 'Compra de créditos em breve!' })
  }

  const handleNewProject = () => {
    // Clear local resume state and remount wizard clean
    localStorage.removeItem('tm_project_id')
    localStorage.removeItem('tm_project_name')
    localStorage.removeItem('tm_resume_project')
    setWizardKey((k) => k + 1)
    setActiveSection('music-video')
    push({ type: 'info', text: 'Novo projeto iniciado.' })
  }

  const sidebarWidth = getSidebarWidth(sidebarCollapsed, isMobile)

  // Render section content
  const renderSection = () => {
    switch (activeSection) {
      case 'music-video':
        return <StepWizard key={wizardKey} locale="pt" />

      case 'image':
        return (
          <PlaceholderSection
            title="Criar Imagem"
            description="Gere imagens únicas com IA a partir de descrições textuais. Perfeito para capas, thumbnails e arte visual."
            icon="🎨"
          />
        )

      case 'animate':
        return (
          <PlaceholderSection
            title="Animar Imagem"
            description="Transforme imagens estáticas em animações dinâmicas. Dê vida às suas criações com movimentos suaves."
            icon="✨"
          />
        )

      case 'text-video':
        return (
          <PlaceholderSection
            title="Texto → Vídeo"
            description="Crie vídeos a partir de descrições textuais. A IA gera cenas completas baseadas no seu roteiro."
            icon="📝"
          />
        )

      case 'image-video':
        return (
          <PlaceholderSection
            title="Imagem → Vídeo"
            description="Transforme uma sequência de imagens em um vídeo fluido com transições e efeitos profissionais."
            icon="🖼️"
          />
        )

      case 'projects':
        return (
          <ProjectsSection
            token={authToken}
            onOpenProject={(projectId) => {
              localStorage.setItem('tm_project_id', projectId)
              localStorage.setItem('tm_resume_project', '1')
              setActiveSection('music-video')
            }}
          />
        )

      case 'history':
        return <HistorySection token={authToken} />

      case 'settings':
        return <SettingsSection onLogout={handleLogout} />

      default:
        return <StepWizard locale="pt" />
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)'
    }}>

      {/* Landing Page (not authenticated) */}
      {!isAuthenticated ? (
        <>
          <LandingPage
            locale="pt"
            onGetStarted={() => setShowAuthModal(true)}
            onSignIn={() => setShowAuthModal(true)}
          />
          <AuthModal
            open={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onAuth={handleAuth}
          />
        </>
      ) : (
        <>
          {/* Sidebar */}
          <Sidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            onNewProject={handleNewProject}
            balance={credits.balance ?? 0}
            onLogout={handleLogout}
            onBuyCredits={handleBuyCredits}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
          />

          {/* Main Content */}
          <main style={{
            marginLeft: sidebarWidth,
            minHeight: '100vh',
            transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: isMobile ? '60px 16px 24px' : '24px 32px'
          }}>
            {renderSection()}
          </main>
        </>
      )}

      <ToastContainer />
    </div>
  )
}

export default App
