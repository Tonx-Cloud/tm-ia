import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { withObservability } from '../_lib/observability.js'
import { loadJwtEnv } from '../_lib/env.js'
import { prisma } from '../_lib/prisma.js'

// ============================================================================
// LOGIN ENDPOINT
// ============================================================================
// IMPORTANT: This endpoint uses loadJwtEnv() NOT loadEnv()!
// loadEnv() requires OPENAI_API_KEY and GEMINI_API_KEY which are not needed here.
// loadJwtEnv() only requires JWT_SECRET.
//
// DO NOT change to loadEnv() - it will cause 500 errors!
// ============================================================================

const DB_PATH = path.join(process.cwd(), '.data', 'users.json')

async function getUsers() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return []
  }
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, hash] = passwordHash.split(':')
  if (!salt || !hash) return false
  const hashToVerify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return hash === hashToVerify
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed', requestId: ctx.requestId })
  }

  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', requestId: ctx.requestId })
  }

  try {
    const users = await getUsers()
    const user = users.find((u: any) => u.email === email)

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials', requestId: ctx.requestId })
    }
    
    // Ensure user exists in Postgres (credits + projects)
    try {
      await prisma.user.upsert({
        where: { id: user.id },
        create: { id: user.id, email: user.email, credits: 0 },
        update: { email: user.email },
      })
    } catch (err) {
      ctx.log('warn', 'auth.login.prisma_upsert_failed', { message: (err as Error).message })
    }

    // Sign a JWT token - use loadJwtEnv() which only needs JWT_SECRET
    const env = loadJwtEnv()
    const token = jwt.sign(
        { userId: user.id, email: user.email, role: 'user' },
        env.JWT_SECRET,
        { expiresIn: '7d' }
    )

    ctx.log('info', 'auth.login.success', { userId: user.id })
    return res.status(200).json({ token })

  } catch (err) {
    ctx.log('error', 'auth.login.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Failed to log in', requestId: ctx.requestId })
  }
})
