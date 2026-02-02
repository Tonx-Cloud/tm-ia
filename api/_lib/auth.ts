import type { VercelRequest } from '@vercel/node'
import jwt from 'jsonwebtoken'
import { loadJwtEnv } from './env.js'
import { supabase } from './supabase.js'

const isDevEnv = () =>
  process.env.NODE_ENV === 'development' ||
  process.env.VERCEL_ENV === 'development' ||
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_DEV === '1'

export type Session = {
  userId: string
  email: string
  role?: 'user' | 'admin'
}

export function isVipEmail(email: string | undefined | null) {
  if (!email) return false
  const lower = email.toLowerCase()
  // VIP allowlist (keep tight)
  // NOTE: Hilton sometimes references this email with a typo. Accept both.
  return lower === 'wiltonsf@gmail.com' || lower === 'hiltonsf@gmail.com'
}

export function getSession(req: VercelRequest): Session | null {
  const rawHeader = (req.headers['authorization'] ?? (req.headers as Record<string, unknown>)['Authorization']) as
    | string
    | string[]
    | undefined

  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const bearer = headerValue?.toString().trim()
  const token = bearer?.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || ''
  const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')

  const isDev = isDevEnv() || isLocal

  const devToken = process.env.DEV_TOKEN || 'dev-token'

  if (isDev && token === devToken) {
    logMaskedToken(token, 'dev.bypass')
    return { userId: 'dev-user', email: 'dev@example.com', role: 'user' }
  }

  try {
    const env = loadJwtEnv()
    const decoded = jwt.verify(token, env.JWT_SECRET) as Session
    return decoded
  } catch (err) {
    if (isDev) logMaskedToken(token, 'jwt.verify.error', (err as Error).message)
    return null
  }
}

function logMaskedToken(token: string, event: string, message?: string) {
  const masked = token.length <= 12 ? token : `${token.slice(0, 6)}...${token.slice(-6)}`
  const meta = { event, token: masked, message }
  console.log(JSON.stringify(meta))
}

export type TokenPayload = {
  userId: string
  email: string
  name?: string
  picture?: string
  provider?: 'email' | 'google' | 'apple'
  role?: 'user' | 'admin'
}

export function signToken(payload: TokenPayload, expiresInDays = 7): string {
  const env = loadJwtEnv()
  const expiresIn = expiresInDays * 24 * 60 * 60 // Convert to seconds
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const env = loadJwtEnv()
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

/**
 * Verify Supabase JWT token and return user session
 * This validates the token against Supabase Auth
 */
export async function verifySupabaseToken(token: string): Promise<Session | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return null
    }

    return {
      userId: user.id,
      email: user.email || '',
      role: user.app_metadata?.role || 'user'
    }
  } catch {
    return null
  }
}

/**
 * Get session from request using Supabase Auth
 * Falls back to legacy JWT verification if Supabase fails
 */
export async function getSessionFromRequest(req: VercelRequest): Promise<Session | null> {
  const rawHeader = (req.headers['authorization'] ?? (req.headers as Record<string, unknown>)['Authorization']) as
    | string
    | string[]
    | undefined

  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const bearer = headerValue?.toString().trim()
  const token = bearer?.replace(/^Bearer\s+/i, '')
  
  if (!token) return null

  const hostHeader = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || ''
  const isLocal = hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1')
  const isDev = isDevEnv() || isLocal

  const devToken = process.env.DEV_TOKEN || 'dev-token'

  if (isDev && token === devToken) {
    logMaskedToken(token, 'dev.bypass')
    return { userId: 'dev-user', email: 'dev@example.com', role: 'user' }
  }

  // Try Supabase first
  const supabaseSession = await verifySupabaseToken(token)
  if (supabaseSession) {
    return supabaseSession
  }

  // Fall back to legacy JWT for backwards compatibility
  const legacySession = getSession(req)
  if (legacySession && isDev) {
    console.log('[Auth] Legacy JWT token used - consider migrating to Supabase')
  }
  
  return legacySession
}
