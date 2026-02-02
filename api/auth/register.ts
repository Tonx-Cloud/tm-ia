import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase.js'
import { withObservability } from '../_lib/observability.js'
import { addCredits, getBalance } from '../_lib/credits.js'

/**
 * POST /api/auth/register
 * Register new user via Supabase Auth
 * 
 * Body: { email: string, password: string, name?: string }
 * Response: { token: string, user: { id, email, name }, balance: number }
 */
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { email, password, name } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    // Register with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name || email.split('@')[0]
        }
      }
    })

    if (error) {
      ctx.log('warn', 'auth.register.failed', { email, error: error.message })
      
      // Handle specific error cases
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return res.status(409).json({ 
          error: 'User with this email already exists',
          message: error.message
        })
      }
      
      return res.status(400).json({ 
        error: 'Registration failed',
        message: error.message
      })
    }

    if (!data.user) {
      return res.status(500).json({ 
        error: 'Registration failed - no user returned' 
      })
    }

    const user = data.user

    // Add initial credits for new user
    try {
      await addCredits(user.id, 50, 'initial')
      ctx.log('info', 'auth.register.credits_added', { userId: user.id, amount: 50 })
    } catch (err) {
      ctx.log('warn', 'auth.register.credits_failed', { 
        userId: user.id, 
        error: (err as Error).message 
      })
    }

    // Get user's credit balance
    const balance = await getBalance(user.id)

    ctx.log('info', 'auth.register.success', { 
      userId: user.id, 
      email: user.email 
    })

    // If auto-confirm is enabled, we get a session
    if (data.session) {
      return res.status(201).json({
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        user: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name
        },
        balance,
        message: 'Registration successful'
      })
    }

    // If email confirmation is required
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name
      },
      balance,
      message: 'Registration successful. Please check your email to confirm your account.'
    })

  } catch (err) {
    const errorMessage = (err as Error).message
    ctx.log('error', 'auth.register.error', { message: errorMessage })
    return res.status(500).json({ 
      error: 'Failed to register user',
      message: errorMessage
    })
  }
})
