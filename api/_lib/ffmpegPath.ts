import ffmpegStatic from 'ffmpeg-static'

// ffmpeg-static typing is a bit loose across CJS/ESM builds.
// At runtime, it resolves to an absolute path string (or null).
export function getFFmpegPath(): string {
  const p = ffmpegStatic as unknown as string | null
  if (!p) throw new Error('ffmpeg binary not available (ffmpeg-static returned null)')
  return p
}
