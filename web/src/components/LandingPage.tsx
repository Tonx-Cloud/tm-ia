import { useState } from 'react'
import type { Locale } from '@/i18n'

const texts = {
  en: {
    badge: '#1 AI Music Video Tool',
    title: 'AI Music Video',
    titleAccent: 'Generator',
    subtitle: 'Create professional music videos for Suno, Udio, and any AI-generated music. Perfect sync, stunning visuals, unlimited creativity.',
    cta: 'Get Started',
    ctaDemo: 'Watch Demo',
    trustedBy: 'Trusted by creators and artists worldwide',
    partners: ['SUNO', 'UDIO', 'MUREKA', 'AI MUSIC'],
    seeInAction: 'See It In Action',
    seeInActionSub: 'Upload your music and watch how our AI transforms it into a cinematic video. In seconds, you\'ll get a short preview generated from the most impactful moment of your track.',
    features: {
      title: 'Powerful Features',
      subtitle: 'Everything you need to create amazing videos',
      items: [
        { icon: 'zap', title: 'Lightning Fast', desc: 'Generate a preview in minutes. No waiting, no complex setup.' },
        { icon: 'music', title: 'Perfect Sync', desc: 'Our AI analyzes rhythm, energy, and structure to match visuals to your music.' },
        { icon: 'sparkles', title: 'Smart Preview', desc: 'We detect the hook and generate a short preview to spark your creativity.' },
        { icon: 'layout', title: 'Multiple Formats', desc: 'Vertical, horizontal, or square. Perfect for TikTok, Instagram, and YouTube.' },
        { icon: 'brain', title: 'AI Creativity', desc: 'Our models understand music and visuals to deliver artistic, engaging videos.' },
        { icon: 'download', title: 'HD Export', desc: 'Download in Full HD without watermarks. Share directly to your platforms.' },
      ]
    },
    ready: {
      title: 'Ready to transform your music?',
      subtitle: 'Join thousands of artists who are already creating stunning videos with our AI platform.',
      cta: 'Start Creating Now',
      ctaSub: 'View Examples'
    },
    footer: {
      tagline: 'Transform your tracks into captivating visual experiences.',
      quality: 'HD Quality',
      noWatermark: 'No Watermarks',
      instant: 'Instant Download'
    },
    nav: {
      features: 'Features',
      examples: 'Examples', 
      pricing: 'Pricing',
      signIn: 'Sign In'
    }
  },
  pt: {
    badge: '#1 Ferramenta de Video Musical com IA',
    title: 'Gerador de Video',
    titleAccent: 'Musical com IA',
    subtitle: 'Crie videos musicais profissionais para Suno, Udio e qualquer musica gerada por IA. Sincronizacao perfeita, visuais impressionantes, criatividade ilimitada.',
    cta: 'Comecar Agora',
    ctaDemo: 'Ver Demo',
    trustedBy: 'Usado por criadores e artistas no mundo todo',
    partners: ['SUNO', 'UDIO', 'MUREKA', 'AI MUSIC'],
    seeInAction: 'Veja em Acao',
    seeInActionSub: 'Envie sua musica e veja como nossa IA transforma o som em imagens impactantes. Geramos automaticamente um preview curto com o trecho mais marcante.',
    features: {
      title: 'Recursos Poderosos',
      subtitle: 'Tudo que voce precisa para criar videos incriveis',
      items: [
        { icon: 'zap', title: 'Rapido de Verdade', desc: 'Gere um preview em minutos. Sem espera, sem configuracao complicada.' },
        { icon: 'music', title: 'Sincronizacao Perfeita', desc: 'Nossa IA analisa ritmo, energia e estrutura para sincronizar visuais com sua musica.' },
        { icon: 'sparkles', title: 'Preview Inteligente', desc: 'Detectamos o refrao e geramos um preview curto para inspirar sua criatividade.' },
        { icon: 'layout', title: 'Multiplos Formatos', desc: 'Vertical, horizontal ou quadrado. Perfeito para TikTok, Instagram e YouTube.' },
        { icon: 'brain', title: 'Criatividade IA', desc: 'Nossos modelos entendem musica e visual para entregar videos artisticos.' },
        { icon: 'download', title: 'Export HD', desc: 'Baixe em Full HD sem marca dagua. Compartilhe direto nas suas plataformas.' },
      ]
    },
    ready: {
      title: 'Pronto para transformar sua musica?',
      subtitle: 'Junte-se a milhares de artistas criando videos incriveis com nossa plataforma de IA.',
      cta: 'Comecar a Criar',
      ctaSub: 'Ver Exemplos'
    },
    footer: {
      tagline: 'Transforme suas faixas em experiencias visuais cativantes.',
      quality: 'Qualidade HD',
      noWatermark: 'Sem Marca Dagua',
      instant: 'Download Instantaneo'
    },
    nav: {
      features: 'Recursos',
      examples: 'Exemplos',
      pricing: 'Precos',
      signIn: 'Entrar'
    }
  }
}

type Props = {
  locale?: Locale
  onGetStarted: () => void
  onSignIn: () => void
}

export function LandingPage({ locale = 'en', onGetStarted, onSignIn }: Props) {
  const t = texts[locale]
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null)

  return (
    <div className="landing-page">
      {/* Hero Background */}
      <div className="landing-bg">
        <div className="landing-bg-gradient" />
        <div className="landing-bg-pattern" />
      </div>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-logo">
          <span className="logo-icon">TM</span>
          <span className="logo-text">TonMoves</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">{t.nav.features}</a>
          <a href="#examples">{t.nav.examples}</a>
          <a href="#pricing">{t.nav.pricing}</a>
        </div>
        <button className="landing-nav-signin" onClick={onSignIn}>
          {t.nav.signIn}
        </button>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-badge">
          <span className="stars">*****</span>
          <span>{t.badge}</span>
        </div>

        <h1 className="landing-title">
          {t.title}
          <br />
          <span className="gradient-text">{t.titleAccent}</span>
        </h1>

        <p className="landing-subtitle">{t.subtitle}</p>

        <div className="landing-cta-group">
          <button className="landing-cta" onClick={onGetStarted}>
            <span className="cta-sparkle">*</span>
            {t.cta}
          </button>
          <button className="landing-cta-secondary" onClick={onGetStarted}>
            {t.ctaDemo}
          </button>
        </div>

        <div className="landing-trust">
          <p>{t.trustedBy}</p>
          <div className="landing-partners">
            {t.partners.map((partner) => (
              <span key={partner} className="partner-badge">{partner}</span>
            ))}
          </div>
        </div>
      </section>

      {/* See In Action Section */}
      <section className="landing-action">
        <h2>{t.seeInAction}</h2>
        <p>{t.seeInActionSub}</p>
        <div className="landing-video-placeholder">
          <div className="video-play-btn">
            <PlayIcon />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="features-header">
          <h2>{t.features.title}</h2>
          <p>{t.features.subtitle}</p>
        </div>
        <div className="features-grid-6">
          {t.features.items.map((feature, i) => (
            <div 
              key={i} 
              className={`feature-card ${hoveredFeature === i ? 'hovered' : ''}`}
              onMouseEnter={() => setHoveredFeature(i)}
              onMouseLeave={() => setHoveredFeature(null)}
            >
              <div className="feature-icon">
                {feature.icon === 'zap' && <ZapIcon />}
                {feature.icon === 'music' && <MusicIcon />}
                {feature.icon === 'sparkles' && <SparklesIcon />}
                {feature.icon === 'layout' && <LayoutIcon />}
                {feature.icon === 'brain' && <BrainIcon />}
                {feature.icon === 'download' && <DownloadIcon />}
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ready Section */}
      <section className="landing-ready">
        <h2>{t.ready.title}</h2>
        <p>{t.ready.subtitle}</p>
        <div className="landing-cta-group">
          <button className="landing-cta" onClick={onGetStarted}>
            {t.ready.cta}
          </button>
          <button className="landing-cta-secondary">
            {t.ready.ctaSub}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-logo">
          <span className="logo-icon">TM</span>
          <span className="logo-text">TonMoves</span>
        </div>
        <p>{t.footer.tagline}</p>
        <div className="footer-badges">
          <span><CheckIcon /> {t.footer.quality}</span>
          <span><CheckIcon /> {t.footer.noWatermark}</span>
          <span><CheckIcon /> {t.footer.instant}</span>
        </div>
      </footer>
    </div>
  )
}

// SVG Icons
function ZapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z" />
    </svg>
  )
}

function LayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}

function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M12 5v13" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: 14, height: 14 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
