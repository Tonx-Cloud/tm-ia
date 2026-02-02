import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase, supabaseAdmin } from '../_lib/supabase.js'
import { addCredits, getBalance } from '../_lib/credits.js'

/**
 * GET /api/auth/callback
 * Handles callback from Supabase Auth (Google OAuth)
 * 
 * Query params from Supabase:
 * - access_token: JWT access token
 * - refresh_token: Refresh token
 * - type: 'recovery' | 'signup' | 'invite' | 'magiclink' | null
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get the hash fragment from URL (Supabase sends tokens in hash)
    // In production, the frontend will extract these and send to this endpoint
    const { access_token, refresh_token, type, error: oauthError, error_description, state } = req.query

    if (oauthError) {
      console.error('Supabase OAuth error:', oauthError, error_description)
      return redirectWithError(res, `OAuth error: ${oauthError} - ${error_description || ''}`)
    }

    if (!access_token || typeof access_token !== 'string') {
      return redirectWithError(res, 'Missing access token')
    }

    // Verify the session with Supabase
    const { data: { user }, error: userError } = await supabase.auth.getUser(access_token)

    if (userError || !user) {
      console.error('Failed to get user from Supabase:', userError)
      return redirectWithError(res, 'Failed to authenticate user')
    }

    console.log('User authenticated via Supabase:', { 
      id: user.id, 
      email: user.email,
      provider: user.app_metadata?.provider 
    })

    // Parse state for redirect URL
    let redirectPath = '/'
    try {
      if (state && typeof state === 'string') {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
        redirectPath = stateData.redirect || '/'
      }
    } catch {
      // Ignore state parsing errors
    }

    // Ensure user exists in credits system
    try {
      // Check if user exists in our credits system, if not add initial credits
      const balance = await getBalance(user.id)
      
      if (balance === 0 && type === 'signup') {
        // New user - give initial credits
        await addCredits(user.id, 50, 'initial')
        console.log('Added initial credits for new user:', user.id)
      }

      // Special admin credits for hiltonsf@gmail.com
      if (user.email === 'hiltonsf@gmail.com' && balance < 5000) {
        await addCredits(user.id, 99999, 'admin_adjust')
        console.log('Added admin credits for hiltonsf@gmail.com')
      }
    } catch (err) {
      console.warn('Failed to setup credits for user:', err)
    }

    // Get current balance
    const balance = await getBalance(user.id)

    // Build redirect URL with tokens
    const frontendUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173'
      : 'https://tm-ia.vercel.app'

    const params = new URLSearchParams({
      token: access_token,
      refresh_token: refresh_token as string || '',
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      picture: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
      balance: String(balance),
      provider: 'google',
      redirect: redirectPath
    })

    res.setHeader('Location', `${frontendUrl}/auth/callback?${params.toString()}`)
    return res.status(302).end()

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('Auth callback error:', errorMessage)
    return redirectWithError(res, `Authentication failed: ${errorMessage}`)
  }
}

function redirectWithError(res: VercelResponse, message: string) {
  const frontendUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:5173'
    : 'https://tm-ia.vercel.app'

  const params = new URLSearchParams({ 
    error: message,
    provider: 'google'
  })
  
  res.setHeader('Location', `${frontendUrl}/auth/callback?${params.toString()}`)
  return res.status(302).end()
}
