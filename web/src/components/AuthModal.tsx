import { useState } from 'react'
import type { Locale } from '@/i18n'
import { register, login } from '@/lib/assetsApi'

const texts = {
  en: {
    createAccount: 'Create an account',
    logIn: 'Log In',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    getStarted: 'Get Started',
    signIn: 'Sign In',
    orSignUpWith: 'Or sign up with',
    orLogInWith: 'Or log in with',
    continueGoogle: 'Continue with Google',
    continueApple: 'Continue with Apple',
    alreadyHave: 'Already have an account?',
    dontHave: "Don't have an account?",
    forgotPassword: 'Forgot password?',
    terms: 'By continuing, you agree to our Terms of Service and Privacy Policy.',
    skipDemo: 'Skip and try demo',
  },
  pt: {
    createAccount: 'Criar uma conta',
    logIn: 'Entrar',
    email: 'Email',
    password: 'Senha',
    confirmPassword: 'Confirmar Senha',
    getStarted: 'Comecar',
    signIn: 'Entrar',
    orSignUpWith: 'Ou cadastre-se com',
    orLogInWith: 'Ou entre com',
    continueGoogle: 'Continuar com Google',
    continueApple: 'Continuar com Apple',
    alreadyHave: 'Ja tem uma conta?',
    dontHave: 'Nao tem uma conta?',
    forgotPassword: 'Esqueceu a senha?',
    terms: 'Ao continuar, voce concorda com nossos Termos de Servico e Politica de Privacidade.',
    skipDemo: 'Pular e testar demo',
  }
}

type Props = {
  locale?: Locale
  open: boolean
  onClose: () => void
  onAuth: (token: string) => void
  onSkipDemo?: () => void
}

export function AuthModal({ locale = 'en', open, onClose, onAuth, onSkipDemo }: Props) {
  const t = texts[locale]
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      let resp: { token: string }
      if (mode === 'signup') {
        resp = await register(email, password)
      } else {
        resp = await login(email, password)
      }
      onAuth(resp.token)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // ==========================================================================
  // SOCIAL AUTH HANDLER
  // ==========================================================================
  // IMPORTANT: The /api/auth/google/check endpoint always returns 200.
  // Check the 'configured' field to determine if OAuth is available.
  // DO NOT change this logic - it handles the case where OAuth is not set up.
  // ==========================================================================
  const handleSocialAuth = async (provider: 'google' | 'apple') => {
    if (provider === 'google') {
      setLoading(true)
      setError(null)
      
      try {
        const checkRes = await fetch('/api/auth/google/check', { method: 'GET' })
        const data = await checkRes.json().catch(() => ({ configured: false }))
        
        // Check the 'configured' field, not the HTTP status
        if (!data.configured) {
          setError(data.message || 'Google OAuth não configurado. Use email e senha.')
          setLoading(false)
          return
        }
        
        // OAuth is configured - redirect to Google
        window.location.href = '/api/auth/google'
      } catch {
        // Network error - show friendly message
        setError('Erro ao verificar OAuth. Use email e senha.')
        setLoading(false)
      }
      return
    }

    setError('Apple Sign-In não está disponível. Use email e senha.')
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="auth-logo">
          <span className="logo-icon">TM</span>
        </div>
        <h2 className="auth-title">
          {mode === 'signup' ? t.createAccount : t.logIn}
        </h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <input
              type="email"
              placeholder={t.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="auth-field">
            <input
              type="password"
              placeholder={t.password}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {mode === 'signup' && (
            <div className="auth-field">
              <input
                type="password"
                placeholder={t.confirmPassword}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? '...' : mode === 'signup' ? t.getStarted : t.signIn}
          </button>
        </form>
        <div className="auth-divider">
          <span>{mode === 'signup' ? t.orSignUpWith : t.orLogInWith}</span>
        </div>
        <div className="auth-social">
          <button
            type="button"
            className="auth-social-btn"
            onClick={() => handleSocialAuth('google')}
          >
            <GoogleIcon />
            {t.continueGoogle}
          </button>
          <button
            type="button"
            className="auth-social-btn"
            onClick={() => handleSocialAuth('apple')}
          >
            <AppleIcon />
            {t.continueApple}
          </button>
        </div>
        <div className="auth-mode-toggle">
          {mode === 'signup' ? (
            <span>{t.alreadyHave} <button onClick={() => setMode('login')}>{t.logIn}</button></span>
          ) : (
            <span>{t.dontHave} <button onClick={() => setMode('signup')}>{t.createAccount}</button></span>
          )}
        </div>
        {onSkipDemo && (
          <button type="button" className="auth-skip" onClick={onSkipDemo}>
            {t.skipDemo}
          </button>
        )}
        <button type="button" className="auth-close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
    </div>
  )
}

// Icons (re-add them as they were removed in previous steps)
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
