import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDemoUsageSnapshot } from '../_lib/demoUsage.js'
import { getSessionFromRequest } from '../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'admin') return res.status(401).json({ error: 'Admin required' })
  const rows = getDemoUsageSnapshot()
  return res.status(200).json({ rows })
}
