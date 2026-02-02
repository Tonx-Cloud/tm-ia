import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase.js'

/**
 * GET /api/auth/google
 * Redirects user to Google OAuth via Supabase Auth
 * 
 * Query params:
 * - redirect: URL to redirect after auth (default: '/')
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const redirectTo = req.query.redirect as string || '/'
    
    // Build the callback URL - this is where Supabase will redirect after Google auth
    const baseUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173'
      : 'https://tm-ia.vercel.app'
    
    const callbackUrl = `${baseUrl}/api/auth/callback`

    // Get the OAuth URL from Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          // Pass the final redirect URL via state
          state: Buffer.from(JSON.stringify({ 
            redirect: redirectTo,
            timestamp: Date.now()
          })).toString('base64')
        }
      }
    })

    if (error) {
      console.error('Supabase OAuth error:', error)
      return res.status(500).json({ 
        error: 'Failed to initiate OAuth',
        message: error.message 
      })
    }

    if (!data.url) {
      return res.status(500).json({ 
        error: 'No OAuth URL returned from Supabase' 
      })
    }

    // Redirect to Google's OAuth screen via Supabase
    res.setHeader('Location', data.url)
    return res.status(302).end()

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('Google OAuth init error:', errorMessage)
    return res.status(500).json({ 
      error: 'Failed to initiate Google OAuth',
      message: errorMessage 
    })
  }
}
