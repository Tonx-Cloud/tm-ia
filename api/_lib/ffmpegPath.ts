import fs from 'fs'
import ffmpegStatic from 'ffmpeg-static'

// Prefer system ffmpeg when available on our worker VM.
// IMPORTANT: On Vercel/serverless we prefer ffmpeg-static to avoid inconsistent /usr/bin/ffmpeg versions
// across runtimes (we've observed 25fps defaults and large dup counts with older system ffmpeg builds).
export function getFFmpegPath(): string {
  const override = process.env.FFMPEG_PATH
  if (override && fs.existsSync(override)) return override

  const p = ffmpegStatic as unknown as string | null
  const onVercel = !!process.env.VERCEL
  if (onVercel) {
    if (!p) throw new Error('ffmpeg-static returned null on Vercel')
    return p
  }

  const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']
  for (const sp of systemPaths) {
    if (fs.existsSync(sp)) return sp
  }

  if (!p) throw new Error('ffmpeg binary not available (system ffmpeg missing and ffmpeg-static returned null)')
  return p
}
