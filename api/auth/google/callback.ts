import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { loadJwtEnv } from '../../_lib/env.js'
import { signToken } from '../../_lib/auth.js'
import { addCredits, getBalance } from '../../_lib/credits.js'

// User storage path
const DATA_DIR = path.join(process.cwd(), '.data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

type User = {
  id: string
  email: string
  name?: string
  picture?: string
  provider: 'google' | 'email'
  googleId?: string
  createdAt: number
}

function loadUsers(): User[] {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    if (!fs.existsSync(USERS_FILE)) return []
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveUsers(users: User[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

function findOrCreateUser(googleUser: { email: string; name?: string; picture?: string; sub: string }): User {
  const users = loadUsers()
  
  // Find by Google ID first
  let user = users.find(u => u.googleId === googleUser.sub)
  
  // Or by email
  if (!user) {
    user = users.find(u => u.email === googleUser.email)
    if (user) {
      // Link Google account to existing email user
      user.googleId = googleUser.sub
      user.provider = 'google'
      user.picture = googleUser.picture
      saveUsers(users)
    }
  }
  
  // Create new user
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      provider: 'google',
      googleId: googleUser.sub,
      createdAt: Date.now()
    }
    users.push(user)
    saveUsers(users)
    
    // Give initial credits to new users
    addCredits(user.id, 50, 'initial')
  }
  
  return user
}

/**
 * GET /api/auth/google/callback
 * Handles OAuth callback from Google
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, state, error: oauthError } = req.query

  if (oauthError) {
    return redirectWithError(res, `Google OAuth error: ${oauthError}`)
  }

  if (!code || typeof code !== 'string') {
    return redirectWithError(res, 'Missing authorization code')
  }

  try {
    loadJwtEnv()
  } catch (err) {
    const details = err instanceof Error ? err.message : 'Unknown configuration issue'
    console.error('Google auth callback failed to load env:', err)
    return redirectWithError(res, `Server configuration error: ${details}`)
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return redirectWithError(res, 'Google OAuth not configured on server')
  }

  // Determine the callback URL
  const baseUrl = process.env.PUBLIC_BASE_URL || 
    (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://tm-ia.vercel.app')
  
  const redirectUri = `${baseUrl}/api/auth/google/callback`

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text()
      console.error('Token exchange failed:', err)
      return redirectWithError(res, 'Failed to exchange authorization code')
    }

    const tokens = await tokenResponse.json() as { access_token: string; id_token?: string }

    // Get user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })

    if (!userResponse.ok) {
      return redirectWithError(res, 'Failed to get user info from Google')
    }

    const googleUser = await userResponse.json() as {
      id: string
      email: string
      name?: string
      picture?: string
      verified_email?: boolean
    }

    if (!googleUser.email) {
      return redirectWithError(res, 'Google account does not have an email')
    }

    // Find or create user
    const user = findOrCreateUser({
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      sub: googleUser.id
    })

    // Generate JWT
    const jwtToken = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: 'google'
    })

    // Get user's credit balance
    const balance = getBalance(user.id)

    // Parse state to get redirect URL
    let redirectPath = '/'
    try {
      if (state && typeof state === 'string') {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
        redirectPath = stateData.redirect || '/'
      }
    } catch {}

    // Redirect to frontend with token
    const frontendUrl = process.env.NODE_ENV === 'development' 
      ? 'http://localhost:5173'
      : (process.env.PUBLIC_BASE_URL || 'https://tm-ia.vercel.app')

    const params = new URLSearchParams({
      token: jwtToken,
      email: user.email,
      name: user.name || '',
      picture: user.picture || '',
      balance: String(balance),
      provider: 'google'
    })

    res.setHeader('Location', `${frontendUrl}/auth/callback?${params.toString()}`)
    return res.status(302).end()

  } catch (err) {
    console.error('Google OAuth error:', err)
    return redirectWithError(res, 'Authentication failed')
  }
}

function redirectWithError(res: VercelResponse, message: string) {
  const frontendUrl = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5173'
    : (process.env.PUBLIC_BASE_URL || 'https://tm-ia.vercel.app')
  
  const params = new URLSearchParams({ error: message })
  res.setHeader('Location', `${frontendUrl}/auth/callback?${params.toString()}`)
  return res.status(302).end()
}
