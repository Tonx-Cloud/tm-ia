import { useState, useEffect } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type SidebarSection = 
  | 'music-video' 
  | 'image' 
  | 'animate' 
  | 'text-video' 
  | 'image-video' 
  | 'projects' 
  | 'history'
  | 'settings'

type SidebarItem = {
  id: SidebarSection
  icon: string
  label: string
  available: boolean
  badge?: string
}

type SidebarProps = {
  activeSection: SidebarSection
  onSectionChange: (section: SidebarSection) => void
  onNewProject?: () => void
  balance: number
  onLogout: () => void
  onBuyCredits?: () => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}

// ============================================================================
// SIDEBAR ITEMS CONFIGURATION
// ============================================================================

const sidebarItems: SidebarItem[] = [
  { id: 'music-video', icon: '🎵', label: 'Vídeo Musical', available: true },
  { id: 'image', icon: '🎨', label: 'Criar Imagem', available: false, badge: 'Em breve' },
  { id: 'animate', icon: '✨', label: 'Animar Imagem', available: false, badge: 'Em breve' },
  { id: 'text-video', icon: '📝', label: 'Texto → Vídeo', available: false, badge: 'Em breve' },
  { id: 'image-video', icon: '🖼️', label: 'Imagem → Vídeo', available: false, badge: 'Em breve' },
  { id: 'projects', icon: '📁', label: 'Meus Projetos', available: true },
  { id: 'history', icon: '📜', label: 'Histórico', available: true },
  { id: 'settings', icon: '⚙️', label: 'Configurações', available: true },
]

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  sidebar: (collapsed: boolean, isMobile: boolean) => ({
    position: 'fixed' as const,
    left: 0,
    top: 0,
    bottom: 0,
    width: collapsed ? 72 : 280,
    background: 'var(--panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 1000,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: isMobile && collapsed ? 'translateX(-100%)' : 'translateX(0)',
  }),

  header: {
    padding: '20px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },

  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #b43bff, #3b82f6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 800,
    color: '#000',
    flexShrink: 0,
  },

  logoText: (collapsed: boolean) => ({
    fontSize: 16,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : 'auto',
    transition: 'all 0.3s',
  }),

  balanceSection: (collapsed: boolean) => ({
    padding: collapsed ? '16px 12px' : '20px 16px',
    borderBottom: '1px solid var(--border)',
  }),

  balanceCard: (collapsed: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: collapsed ? '12px 8px' : '16px',
    background: 'linear-gradient(135deg, rgba(180, 59, 255, 0.1), rgba(59, 130, 246, 0.1))',
    border: '1px solid rgba(180, 59, 255, 0.2)',
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
    justifyContent: collapsed ? 'center' : 'flex-start',
  }),

  balanceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #b43bff, #3b82f6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    flexShrink: 0,
  },

  balanceInfo: (collapsed: boolean) => ({
    display: collapsed ? 'none' : 'block',
  }),

  balanceValue: {
    fontSize: 18,
    fontWeight: 700,
  },

  balanceLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  },

  nav: {
    flex: 1,
    padding: '16px 0',
    overflowY: 'auto' as const,
  },

  navGroup: {
    marginBottom: 8,
  },

  navGroupLabel: (collapsed: boolean) => ({
    padding: '8px 16px',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    display: collapsed ? 'none' : 'block',
  }),

  navItem: (active: boolean, available: boolean, collapsed: boolean) => ({
    width: '100%',
    padding: collapsed ? '14px 0' : '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: active ? 'rgba(180, 59, 255, 0.15)' : 'transparent',
    color: !available ? 'var(--text-muted)' : active ? 'var(--accent)' : 'var(--text)',
    border: 'none',
    borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
    cursor: available ? 'pointer' : 'default',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    transition: 'all 0.2s',
    opacity: available ? 1 : 0.6,
    justifyContent: collapsed ? 'center' : 'flex-start',
  }),

  navItemIcon: {
    fontSize: 18,
    flexShrink: 0,
  },

  navItemLabel: (collapsed: boolean) => ({
    flex: 1,
    textAlign: 'left' as const,
    display: collapsed ? 'none' : 'block',
  }),

  navItemBadge: (collapsed: boolean) => ({
    fontSize: 9,
    padding: '2px 6px',
    borderRadius: 6,
    background: 'rgba(180, 59, 255, 0.2)',
    color: 'var(--accent)',
    fontWeight: 600,
    display: collapsed ? 'none' : 'block',
  }),

  footer: {
    padding: '16px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },

  contactBtn: (collapsed: boolean) => ({
    width: '100%',
    padding: collapsed ? '12px 8px' : '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(59, 130, 246, 0.08)',
    color: 'var(--text)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s',
    justifyContent: collapsed ? 'center' : 'flex-start',
    textDecoration: 'none',
  }),

  logoutBtn: (collapsed: boolean) => ({
    width: '100%',
    padding: collapsed ? '12px 8px' : '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: 10,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s',
    justifyContent: collapsed ? 'center' : 'flex-start',
  }),

  collapseBtn: {
    width: '100%',
    padding: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 16,
    transition: 'all 0.2s',
  },

  mobileOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },

  mobileToggle: {
    position: 'fixed' as const,
    top: 16,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 12,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 1001,
    fontSize: 20,
  },

  tooltip: {
    position: 'absolute' as const,
    left: '100%',
    marginLeft: 8,
    padding: '6px 12px',
    background: 'var(--panel-strong)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const CONTACT_EMAIL = 'hiltonsf@gmail.com'

export function Sidebar({
  activeSection,
  onSectionChange,
  onNewProject,
  balance,
  onLogout,
  onBuyCredits,
  collapsed = false,
  onCollapsedChange,
}: SidebarProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close mobile menu on section change
  useEffect(() => {
    if (isMobile) setMobileOpen(false)
  }, [activeSection, isMobile])

  const handleNavClick = (item: SidebarItem) => {
    if (item.available) {
      onSectionChange(item.id)
    }
  }

  const isCollapsed = isMobile ? !mobileOpen : collapsed

  // Group items
  const createItems = sidebarItems.filter(i => ['music-video', 'image', 'animate', 'text-video', 'image-video'].includes(i.id))
  const manageItems = sidebarItems.filter(i => ['projects', 'history', 'settings'].includes(i.id))

  return (
    <>
      {/* Mobile Toggle Button */}
      {isMobile && (
        <button 
          style={styles.mobileToggle}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobile && mobileOpen && (
        <div 
          style={styles.mobileOverlay}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside style={styles.sidebar(isCollapsed, isMobile && !mobileOpen)}>
        
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>TM</div>
          <span style={styles.logoText(isCollapsed)}>TM-IA Studio</span>
        </div>

        {/* Balance */}
        <div style={styles.balanceSection(isCollapsed)}>
          <div 
            style={styles.balanceCard(isCollapsed)}
            onClick={onBuyCredits}
            title={isCollapsed ? `${balance.toLocaleString()} créditos` : undefined}
          >
            <div style={styles.balanceIcon}>💎</div>
            <div style={styles.balanceInfo(isCollapsed)}>
              <div style={styles.balanceValue}>{balance.toLocaleString()}</div>
              <div style={styles.balanceLabel}>créditos disponíveis</div>
            </div>
          </div>

          {/* New Project */}
          {onNewProject && (
            <button
              className="btn-primary"
              onClick={() => onNewProject()}
              style={{
                width: '100%',
                marginTop: 10,
                padding: isCollapsed ? '10px 8px' : '10px 12px',
                borderRadius: 10,
                fontSize: 13,
              }}
              title={isCollapsed ? 'Novo projeto' : undefined}
            >
              ➕ {isCollapsed ? '' : 'Novo projeto'}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav style={styles.nav}>
          
          {/* Create Section */}
          <div style={styles.navGroup}>
            <div style={styles.navGroupLabel(isCollapsed)}>Criar</div>
            {createItems.map((item) => (
              <div key={item.id} style={{ position: 'relative' }}>
                <button
                  style={styles.navItem(activeSection === item.id, item.available, isCollapsed)}
                  onClick={() => handleNavClick(item)}
                  onMouseEnter={() => isCollapsed && setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <span style={styles.navItemIcon}>{item.icon}</span>
                  <span style={styles.navItemLabel(isCollapsed)}>{item.label}</span>
                  {item.badge && <span style={styles.navItemBadge(isCollapsed)}>{item.badge}</span>}
                </button>
                
                {/* Tooltip for collapsed state */}
                {isCollapsed && hoveredItem === item.id && (
                  <div style={styles.tooltip}>
                    {item.label}
                    {item.badge && <span style={{ marginLeft: 8, opacity: 0.6 }}>({item.badge})</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Manage Section */}
          <div style={styles.navGroup}>
            <div style={styles.navGroupLabel(isCollapsed)}>Gerenciar</div>
            {manageItems.map((item) => (
              <div key={item.id} style={{ position: 'relative' }}>
                <button
                  style={styles.navItem(activeSection === item.id, item.available, isCollapsed)}
                  onClick={() => handleNavClick(item)}
                  onMouseEnter={() => isCollapsed && setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <span style={styles.navItemIcon}>{item.icon}</span>
                  <span style={styles.navItemLabel(isCollapsed)}>{item.label}</span>
                </button>
                
                {isCollapsed && hoveredItem === item.id && (
                  <div style={styles.tooltip}>{item.label}</div>
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div style={styles.footer}>
          {/* Collapse Toggle (desktop only) */}
          {!isMobile && onCollapsedChange && (
            <button
              style={styles.collapseBtn}
              onClick={() => onCollapsedChange(!collapsed)}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              {collapsed ? '→' : '←'}
            </button>
          )}

          {/* Contato */}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={styles.contactBtn(isCollapsed) as any}
            title={isCollapsed ? `Contato: ${CONTACT_EMAIL}` : undefined}
          >
            <span>✉️</span>
            {!isCollapsed && <span>Contato</span>}
          </a>

          {/* Logout */}
          <button
            style={styles.logoutBtn(isCollapsed)}
            onClick={onLogout}
            title={isCollapsed ? 'Sair' : undefined}
          >
            <span>🚪</span>
            {!isCollapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

// ============================================================================
// HELPER: Get sidebar width for layout calculations
// ============================================================================

export function getSidebarWidth(collapsed: boolean, isMobile: boolean): number {
  if (isMobile) return 0
  return collapsed ? 72 : 280
}
