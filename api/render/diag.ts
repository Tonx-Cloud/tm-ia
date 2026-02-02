import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spawn } from 'child_process'
import { getSessionFromRequest } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'
import { getFFmpegPath } from '../_lib/ffmpegPath.js'

async function runFFmpegVersion(ffmpegPath: string): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ['-version'])
    let out = ''
    p.stdout.on('data', (d) => (out += d.toString()))
    p.stderr.on('data', (d) => (out += d.toString()))
    p.on('close', () => resolve(out.trim()))
    p.on('error', (err) => resolve(`ffmpeg spawn error: ${err.message}`))
  })
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  // This endpoint helps debug the runtime (Vercel/VM) ffmpeg binary.
  let ffmpegPath = ''
  let version = ''
  try {
    ffmpegPath = getFFmpegPath()
    version = await runFFmpegVersion(ffmpegPath)
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: (err as Error).message,
      ffmpegPath,
      requestId: ctx.requestId,
    })
  }

  return res.status(200).json({
    ok: true,
    ffmpegPath,
    version,
    env: {
      hasFFMPEG_PATH: !!process.env.FFMPEG_PATH,
      hasVERCEL: !!process.env.VERCEL,
      vercelRegion: process.env.VERCEL_REGION || null,
    },
    requestId: ctx.requestId,
  })
})
