import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getBalance, addCredits } from '../_lib/credits.js'
import { getSessionFromRequest } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required' })

  // seed demo balance if missing
  if ((await getBalance(session.userId)) === 0) {
    await addCredits(session.userId, 50, 'initial')
  }
  const balance = await getBalance(session.userId)
  return res.status(200).json({ balance, userId: session.userId })
}

