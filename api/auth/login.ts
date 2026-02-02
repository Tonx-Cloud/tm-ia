import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase.js'
import { withObservability } from '../_lib/observability.js'
import { getBalance } from '../_lib/credits.js'

/**
 * POST /api/auth/login
 * Authenticate user via Supabase Auth
 * 
 * Body: { email: string, password: string }
 * Response: { token: string, user: { id, email, name, picture }, balance: number }
 */
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', requestId: ctx.requestId })
  }

  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', requestId: ctx.requestId })
  }

  try {
    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      ctx.log('warn', 'auth.login.failed', { email, error: error.message })
      return res.status(401).json({ 
        error: 'Invalid credentials', 
        message: error.message,
        requestId: ctx.requestId 
      })
    }

    if (!data.session || !data.user) {
      return res.status(500).json({ 
        error: 'Authentication failed', 
        requestId: ctx.requestId 
      })
    }

    const user = data.user
    const session = data.session

    // Get user's credit balance
    const balance = await getBalance(user.id)

    ctx.log('info', 'auth.login.success', { 
      userId: user.id, 
      email: user.email,
      provider: user.app_metadata?.provider 
    })

    return res.status(200).json({
      token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name,
        picture: user.user_metadata?.avatar_url || user.user_metadata?.picture
      },
      balance
    })

  } catch (err) {
    const errorMessage = (err as Error).message
    ctx.log('error', 'auth.login.error', { message: errorMessage })
    return res.status(500).json({ 
      error: 'Failed to log in', 
      message: errorMessage,
      requestId: ctx.requestId 
    })
  }
})
