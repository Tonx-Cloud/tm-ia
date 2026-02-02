import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase, supabaseAdmin } from '../_lib/supabase.js'
import { withObservability } from '../_lib/observability.js'
import { getBalance } from '../_lib/credits.js'

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
    const fullName = name || email.split('@')[0]

    // For test flows, we may want to auto-confirm email/password users so they can login immediately.
    // This avoids the "no session/token until email confirmation" behavior.
    const allowAutoConfirm = process.env.AUTH_AUTO_CONFIRM_EMAIL_PASSWORD === '1'
    const isProd = process.env.VERCEL_ENV === 'production'
    const isHiltonTestEmail = /^hiltonsf\+.*@gmail\.com$/i.test(String(email))

    // Register with Supabase Auth
    const { data, error } = allowAutoConfirm && (!isProd || isHiltonTestEmail)
      ? await (async () => {
          // Admin create user with email_confirm=true
          const created = await (supabaseAdmin as any).auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          })

          if (created.error) return { data: { user: null, session: null }, error: created.error }

          // Then sign-in to return a session/token
          const signed = await supabase.auth.signInWithPassword({ email, password })
          return { data: { user: created.data?.user || signed.data?.user, session: signed.data?.session }, error: signed.error }
        })()
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName
            }
          }
        })

    if (error) {
      ctx.log('warn', 'auth.register.failed', { email, error: error.message })

      // Handle specific error cases
      if (error.message.includes('already registered') || error.message.includes('already exists') || error.message.includes('User already registered')) {
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

    // Initial credits are now handled automatically by ensureUser() when getBalance is called
    // This unifies the logic for both Email and OAuth users

    // Get user's credit balance (this triggers ensureUser + 50 credits if new)
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
