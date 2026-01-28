import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { withObservability } from '../_lib/observability.js'
import { loadJwtEnv } from '../_lib/env.js'

const DB_PATH = path.join(process.cwd(), '.data', 'users.json')

type UserRecord = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

async function getUsers(): Promise<UserRecord[]> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    // If file doesn't exist, return empty array
    return []
  }
}

async function saveUsers(users: UserRecord[]) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true })
  await fs.writeFile(DB_PATH, JSON.stringify(users, null, 2))
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

// ============================================================================
// REGISTER ENDPOINT
// ============================================================================
// IMPORTANT: This endpoint uses loadJwtEnv() NOT loadEnv()!
// loadEnv() requires OPENAI_API_KEY and GEMINI_API_KEY which are not needed here.
// loadJwtEnv() only requires JWT_SECRET.
//
// DO NOT change to loadEnv() - it will cause 500 errors!
// ============================================================================

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const users = await getUsers()

    if (users.find((u) => u.email === email)) {
      return res.status(409).json({ error: 'User with this email already exists' })
    }

    const newUser: UserRecord = {
      id: `user-${crypto.randomUUID()}`,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    }

    users.push(newUser)
    await saveUsers(users)
    
    // Sign a JWT token - use loadJwtEnv() which only needs JWT_SECRET
    const env = loadJwtEnv()
    const token = jwt.sign(
        { userId: newUser.id, email: newUser.email, role: 'user' },
        env.JWT_SECRET,
        { expiresIn: '7d' }
    )

    ctx.log('info', 'auth.register.success', { userId: newUser.id })
    return res.status(201).json({ token })

  } catch (err) {
    ctx.log('error', 'auth.register.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Failed to register user' })
  }
})
