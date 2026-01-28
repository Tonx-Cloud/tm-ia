import type { VercelRequest } from '@vercel/node'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ObservabilityContext } from './observability.js'

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitStore {
  [key: string]: RateLimitEntry
}

const RATE_LIMIT_FILE = path.join(os.tmpdir(), 'rate_limit.json')

function loadStore(): RateLimitStore {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      return JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8')) as RateLimitStore
    }
  } catch {
    // ignore
  }
  return {}
}

function saveStore(store: RateLimitStore) {
  try {
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(store))
  } catch {
    // ignore
  }
}

function cleanExpired(store: RateLimitStore, now: number): RateLimitStore {
  const cleaned: RateLimitStore = {}
  for (const [key, entry] of Object.entries(store)) {
    if (entry.resetAt > now) cleaned[key] = entry
  }
  return cleaned
}

export type RateLimitResult = { allowed: true; remaining: number; resetAt: number } | { allowed: false; retryAfterSeconds: number }

export function checkRateLimit(
  req: VercelRequest,
  opts: { limit: number; windowMs: number; key?: string; ctx?: ObservabilityContext },
): RateLimitResult {
  const key = opts.key || getKey(req)
  const now = Date.now()
  let store = loadStore()
  store = cleanExpired(store, now)

  const entry = store[key]

  if (!entry || now > entry.resetAt) {
    store[key] = { count: 1, resetAt: now + opts.windowMs }
    saveStore(store)
    return { allowed: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs }
  }

  entry.count += 1
  store[key] = entry
  saveStore(store)

  if (entry.count > opts.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
    opts.ctx?.log?.('warn', 'rate.limit.exceeded', { key, retryAfterSeconds })
    return { allowed: false, retryAfterSeconds }
  }

  return { allowed: true, remaining: Math.max(0, opts.limit - entry.count), resetAt: entry.resetAt }
}

function getKey(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
  return forwarded || req.socket.remoteAddress || 'anon'
}
