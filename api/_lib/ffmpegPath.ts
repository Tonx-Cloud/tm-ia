import fs from 'fs'
import ffmpegStatic from 'ffmpeg-static'

// Prefer system ffmpeg when available (e.g. on our GCE worker VM).
// Fallback to ffmpeg-static for Vercel/dev environments.
export function getFFmpegPath(): string {
  const override = process.env.FFMPEG_PATH
  if (override && fs.existsSync(override)) return override

  const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']
  for (const p of systemPaths) {
    if (fs.existsSync(p)) return p
  }

  const p = ffmpegStatic as unknown as string | null
  if (!p) throw new Error('ffmpeg binary not available (system ffmpeg missing and ffmpeg-static returned null)')
  return p
}
