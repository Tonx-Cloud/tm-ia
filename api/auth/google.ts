import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * GET /api/auth/google
 * Redirects user to Google OAuth consent screen
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim()
  if (!clientId) {
    // Return a user-friendly error that suggests using email/password
    return res.status(503).json({
      error: 'Google OAuth não configurado',
      message: 'Por favor, use login com email e senha.',
      code: 'OAUTH_NOT_CONFIGURED'
    })
  }

  // Determine the callback URL based on environment
  const baseUrl = (process.env.PUBLIC_BASE_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://tm-ia.vercel.app')).replace(/\s+/g, '')

  const redirectUri = `${baseUrl}/api/auth/google/callback`

  // Build Google OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    // State parameter for CSRF protection
    state: Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      redirect: req.query.redirect || '/'
    })).toString('base64')
  })

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  // Redirect to Google
  res.setHeader('Location', googleAuthUrl)
  return res.status(302).end()
}
