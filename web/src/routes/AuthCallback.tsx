import { useEffect, useState, useRef } from 'react'

type Props = {
  onSuccess: (data: { token: string; email: string; name?: string; picture?: string; balance: number }) => void
  onError: (error: string) => void
}

export function AuthCallback({ onSuccess, onError }: Props) {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('')
  const processed = useRef(false)

  useEffect(() => {
    // Prevent double execution
    if (processed.current) return
    processed.current = true

    const params = new URLSearchParams(window.location.search)
    
    const error = params.get('error')
    if (error) {
      setStatus('error')
      setMessage(error)
      onError(error)
      return
    }

    const token = params.get('token')
    const email = params.get('email')
    const name = params.get('name') || undefined
    const picture = params.get('picture') || undefined
    const balance = parseInt(params.get('balance') || '0', 10)

    if (!token || !email) {
      setStatus('error')
      setMessage('Invalid callback parameters')
      onError('Invalid callback parameters')
      return
    }

    // Store token
    localStorage.setItem('tm_auth_token', token)
    
    setStatus('success')
    setMessage(`Welcome, ${name || email}!`)
    
    // Clean URL first
    window.history.replaceState({}, '', '/')
    
    // Small delay to show success message, then notify parent
    setTimeout(() => {
      onSuccess({ token, email, name, picture, balance })
    }, 800)
  }, [onSuccess, onError])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      color: 'var(--text)'
    }}>
      <div style={{
        textAlign: 'center',
        padding: 40,
        maxWidth: 400
      }}>
        {status === 'processing' && (
          <>
            <div className="spinner" style={{ margin: '0 auto 20px' }} />
            <h2>Completing sign in...</h2>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div style={{ 
              width: 64, height: 64, 
              borderRadius: '50%', 
              background: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: 32
            }}>
              ✓
            </div>
            <h2>{message}</h2>
            <p style={{ color: 'var(--text-muted)' }}>Redirecting to dashboard...</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div style={{ 
              width: 64, height: 64, 
              borderRadius: '50%', 
              background: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: 32,
              color: 'white'
            }}>
              ✕
            </div>
            <h2>Sign in failed</h2>
            <p style={{ color: 'var(--danger)' }}>{message}</p>
            <button 
              className="btn-primary" 
              style={{ marginTop: 20 }}
              onClick={() => window.location.href = '/'}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
