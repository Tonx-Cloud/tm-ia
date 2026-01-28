import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getBalance, addCredits } from '../_lib/credits.js'
import { getSession } from '../_lib/auth.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Auth required' })

  // seed demo balance if missing
  if (getBalance(session.userId) === 0) {
    addCredits(session.userId, 50, 'initial')
  }
  const balance = getBalance(session.userId)
  return res.status(200).json({ balance, userId: session.userId })
}

