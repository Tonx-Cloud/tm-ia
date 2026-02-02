import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_lib/supabase.js'

/**
 * GET /api/auth/google
 * Redirects user to Supabase Google OAuth
 * This aligns with the frontend usage of signInWithGoogle
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Determine the callback URL based on environment
  const origin = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5173' 
    : 'https://tm-ia.vercel.app'
  
  const redirectTo = `${origin}/auth/callback`

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) throw error

    if (data?.url) {
      res.setHeader('Location', data.url)
      return res.status(302).end()
    }

    return res.status(500).json({ error: 'Failed to generate OAuth URL' })

  } catch (err) {
    console.error('OAuth redirect error:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
