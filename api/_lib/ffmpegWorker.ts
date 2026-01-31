import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { getFFmpegPath } from './ffmpegPath.js'
import { getProject } from './projectStore.js'
import { prisma } from './prisma.js'
import { type RenderJob } from './renderPipeline.js'
import { put } from '@vercel/blob'

// ============================================================================
// Types
// ============================================================================

export type RenderFormat = 'vertical' | 'horizontal' | 'square'
export type RenderQuality = 'basic' | 'standard' | 'pro'

export type RenderOptions = {
  format?: RenderFormat
  quality?: RenderQuality
  watermark?: boolean
  crossfade?: boolean
  crossfadeDuration?: number // seconds
}

type Resolution = { width: number; height: number }

const RESOLUTIONS: Record<RenderQuality, Record<RenderFormat, Resolution>> = {
  basic: {
    horizontal: { width: 1280, height: 720 },
    vertical: { width: 720, height: 1280 },
    square: { width: 720, height: 720 },
  },
  standard: {
    horizontal: { width: 1920, height: 1080 },
    vertical: { width: 1080, height: 1920 },
    square: { width: 1080, height: 1080 },
  },
  pro: {
    horizontal: { width: 1920, height: 1080 },
    vertical: { width: 1080, height: 1920 },
    square: { width: 1080, height: 1080 },
  },
}

const BITRATES: Record<RenderQuality, string> = {
  basic: '2500k',
  standard: '5000k',
  pro: '8000k',
}

const PRESETS: Record<RenderQuality, string> = {
  basic: 'veryfast',
  standard: 'fast',
  pro: 'medium', // Slower, better compression
}

// ============================================================================
// Job Status Management
// ============================================================================

async function updateJobStatus(
  userId: string,
  renderId: string,
  status: RenderJob['status'],
  outputUrl?: string,
  error?: string,
  logTail?: string
) {
  const data: any = {
    status,
    outputUrl: outputUrl ?? undefined,
    error: error ?? undefined,
    logTail: logTail ?? undefined,
  }
  if (status === 'processing') data.progress = 5
  if (status === 'complete') data.progress = 100

  await prisma.render.updateMany({
    where: { id: renderId, userId },
    data,
  })
}

async function updateJobProgress(userId: string, renderId: string, progress: number, logTail?: string) {
  await prisma.render.updateMany({
    where: { id: renderId, userId, status: 'processing' },
    data: {
      progress: Math.min(99, Math.max(5, progress)),
      logTail: logTail ?? undefined,
    },
  })
}

// ============================================================================
// Cleanup
// ============================================================================

export function cleanupRenderJob(jobId: string): boolean {
  const workDir = path.join(os.tmpdir(), `render_${jobId}`)
  try {
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true })
      console.log(`Cleaned up render directory: ${workDir}`)
      return true
    }
  } catch (err) {
    console.error(`Failed to cleanup ${workDir}:`, err)
  }
  return false
}

export function cleanupOldRenders(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const tmpDir = os.tmpdir()
  let cleaned = 0
  try {
    const entries = fs.readdirSync(tmpDir)
    const now = Date.now()
    for (const entry of entries) {
      if (entry.startsWith('render_')) {
        const fullPath = path.join(tmpDir, entry)
        try {
          const stat = fs.statSync(fullPath)
          if (stat.isDirectory() && now - stat.mtimeMs > maxAgeMs) {
            fs.rmSync(fullPath, { recursive: true, force: true })
            cleaned++
            console.log(`Cleaned up old render: ${entry}`)
          }
        } catch {
          // ignore individual errors
        }
      }
    }
  } catch (err) {
    console.error('Failed to scan temp directory:', err)
  }
  return cleaned
}

// ============================================================================
// FFmpeg Progress Parsing
// ============================================================================

function parseFFmpegProgress(stderr: string, totalDurationSec: number): number | null {
  // FFmpeg outputs: time=00:00:05.23
  const match = stderr.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const seconds = parseInt(match[3], 10)
    const centiseconds = parseInt(match[4], 10)
    const currentTime = hours * 3600 + minutes * 60 + seconds + centiseconds / 100
    if (totalDurationSec > 0) {
      return Math.min(95, Math.round((currentTime / totalDurationSec) * 100))
    }
  }
  return null
}

// ============================================================================
// Video Filter Construction
// ============================================================================

function buildVideoFilters(options: RenderOptions): string[] {
  const filters: string[] = []
  const format = options.format || 'horizontal'
  const quality = options.quality || 'standard'
  const res = RESOLUTIONS[quality][format]

  // 1. Scale to target resolution with padding (letterbox/pillarbox)
  // This ensures all images fit the target aspect ratio
  filters.push(
    `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease`,
    `pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:black`
  )

  // 2. Ensure even dimensions (H.264 requirement) - already handled by fixed sizes above
  // But add as safety for any edge cases
  filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')

  // 3. Watermark for demo renders
  if (options.watermark) {
    filters.push(
      `drawtext=text='TM-IA DEMO':fontsize=48:fontcolor=white@0.4:x=w-tw-20:y=h-th-20:shadowcolor=black@0.3:shadowx=2:shadowy=2`
    )
  }

  return filters
}

function summarizeStoryboardForLog(project: any) {
  try {
    const sb = (project?.storyboard || []) as any[]
    const lines = sb.map((s, i) => {
      const anim = String(s.animateType || s.animation || (s.animate ? 'zoom-in' : 'none'))
      const dur = Number(s.durationSec || 0) || 0
      const assetId = s.assetId ? String(s.assetId) : 'unknown'
      return `scene#${String(i + 1).padStart(2, '0')} asset=${assetId} dur=${dur}s anim=${anim}`
    })
    return lines.join('\n')
  } catch {
    return ''
  }
}

// ============================================================================
// Main Render Function
// ============================================================================

export async function startFFmpegRender(userId: string, job: RenderJob, options: RenderOptions = {}) {
  // Update status to processing immediately
  await updateJobStatus(userId, job.renderId, 'processing')

  try {
    const project = await getProject(job.projectId)
      if (!project) throw new Error('Project not found')

      // Audio may be inline base64 (prod) or a local tmp path (dev)
      let audioInput = ''

      if (project.audioUrl) {
        const tmpDir = os.tmpdir()
        const workAudio = path.join(tmpDir, `audio_${job.renderId}.bin`)
        const resp = await fetch(project.audioUrl)
        if (!resp.ok) throw new Error(`Audio download failed (${resp.status})`)
        const buf = Buffer.from(await resp.arrayBuffer())
        fs.writeFileSync(workAudio, buf)
        audioInput = workAudio
      } else if (project.audioData) {
        const tmpDir = os.tmpdir()
        const workAudio = path.join(tmpDir, `audio_${job.renderId}.bin`)
        const buf = Buffer.from(project.audioData, 'base64')
        fs.writeFileSync(workAudio, buf)
        audioInput = workAudio
      } else if (project.audioPath && fs.existsSync(project.audioPath)) {
        audioInput = project.audioPath
      }

      if (!audioInput) {
        throw new Error('Audio file missing')
      }

      const tmpDir = os.tmpdir()
      const workDir = path.join(tmpDir, `render_${job.renderId}`)
      if (!fs.existsSync(workDir)) fs.mkdirSync(workDir)

      // 1. Extract Images from storyboard
      // IMPORTANT: preserve correct extension based on mimeType; do not assume png.
      const imageFiles: Array<string | null> = Array.from({ length: project.storyboard.length }).map(() => null)

      for (const [index, item] of project.storyboard.entries()) {
        const asset = project.assets.find((a) => a.id === item.assetId)
        if (!asset || !asset.dataUrl) continue

        const m = asset.dataUrl.match(/^data:(image\/[^;]+);base64,(.*)$/)
        if (!m) continue

        const mime = m[1]
        const base64Data = m[2]
        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'

        const filename = `frame_${index.toString().padStart(3, '0')}.${ext}`
        const filePath = path.join(workDir, filename)
        fs.writeFileSync(filePath, base64Data, 'base64')
        imageFiles[index] = filename
      }

      let present = imageFiles.filter(Boolean) as string[]

      // Some older clients accidentally persisted a UI storyboard format (missing assetId).
      // If that happens, fall back to rendering in the current assets order.
      if (present.length === 0 && project.assets && project.assets.length > 0) {
        const fallbackFiles: string[] = []
        for (const [index, asset] of project.assets.entries()) {
          if (!asset?.dataUrl) continue
          const m = asset.dataUrl.match(/^data:(image\/[^;]+);base64,(.*)$/)
          if (!m) continue
          const mime = m[1]
          const base64Data = m[2]
          const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
          const filename = `frame_${index.toString().padStart(3, '0')}.${ext}`
          const filePath = path.join(workDir, filename)
          fs.writeFileSync(filePath, base64Data, 'base64')
          fallbackFiles.push(filename)
        }
        present = fallbackFiles
      }

      if (present.length === 0) throw new Error('No images to render')

      // 2. Calculate total duration for progress tracking
      const defaultDuration = 5
      let totalDurationSec = 0
      const durations: number[] = []

      for (const item of project.storyboard) {
        const dur = item.durationSec || defaultDuration
        durations.push(dur)
        totalDurationSec += dur
      }

      // Ensure the video duration matches the audio duration.
      // We enforce this in two ways:
      // 1) Normalize per-scene durations to cover the audio length.
      // 2) Pass -t <audioDur> to FFmpeg so the output cannot exceed the audio.
      const getAudioDurationSec = async () => {
        try {
          const ffmpegPath = getFFmpegPath()
          const p = spawn(ffmpegPath, ['-i', audioInput], { cwd: workDir })
          let s = ''
          for await (const chunk of p.stderr as any) s += chunk.toString()
          const m = s.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/)
          if (!m) return null
          const h = Number(m[1])
          const mi = Number(m[2])
          const se = Number(m[3])
          return h * 3600 + mi * 60 + se
        } catch {
          return null
        }
      }

      const audioDur = await getAudioDurationSec()
      const nScenes = Math.max(1, project.storyboard.length || present.length)
      if (audioDur && nScenes > 0) {
        const per = Math.max(1, Math.round((audioDur / nScenes) * 100) / 100)
        for (let i = 0; i < durations.length; i++) durations[i] = per
        totalDurationSec = audioDur
      }

      // 3. Build FFmpeg command based on whether crossfade is enabled
      const outputFile = path.join(workDir, 'output.mp4')
      const audioInputPath = audioInput
      const videoFilters = buildVideoFilters(options)
      const filterString = videoFilters.join(',')

      let args: string[]

      // If any scene has animation, use a filter_complex concat pipeline (per-scene control).
      // Supported: zoom-in, zoom-out, pan-left, pan-right, pan-up, pan-down, fade-in, fade-out.
      const animateTypes = (project.storyboard as any[]).map((s) => String(s.animateType || s.animation || (s.animate ? 'zoom-in' : 'none')))
      const hasAnim = animateTypes.some((t) => t && t !== 'none')

      // Write a helpful debug header to logTail (visible via /api/render/status)
      try {
        const sbLog = summarizeStoryboardForLog(project)
        const header = `TM-IA render debug\nformat=${options.format || 'horizontal'} quality=${options.quality || 'standard'}\nscenes=${project.storyboard.length}\n${sbLog}\n`
        await updateJobProgress(userId, job.renderId, 5, header.slice(-1500))
      } catch {
        // ignore
      }

      // NOTE: Crossfade (filter_complex + xfade) has proven brittle across FFmpeg builds.
      // We'll use filter_complex only for per-scene animation; otherwise concat demuxer.
      if (options.crossfade && present.length > 1) {
        console.log('Crossfade requested but disabled for stability; using concat/filters approach.')
      }

      if (hasAnim) {
        const fps = 30
        const inputs: string[] = []
        const filterParts: string[] = []
        const labels: string[] = []

        // Add each image as loop input
        for (let i = 0; i < imageFiles.length; i++) {
          const filename = imageFiles[i]
          if (!filename) continue
          const dur = durations[i] || defaultDuration
          inputs.push('-loop', '1', '-t', String(dur), '-i', path.join(workDir, filename))
        }

        // audio input
        const audioIndex = inputs.filter((x) => x === '-i').length
        inputs.push('-i', audioInputPath)

        // Build per-scene filters
        let vIn = 0
        for (let i = 0; i < imageFiles.length; i++) {
          const filename = imageFiles[i]
          if (!filename) continue
          const dur = durations[i] || defaultDuration
          const frames = Math.max(1, Math.round(dur * fps))
          const anim = animateTypes[i] || 'none'
          const out = `v${i}`

          const base = `${filterString},fps=${fps}`

          if (anim === 'zoom-in') {
            filterParts.push(`[${vIn}:v]${base},zoompan=z='min(zoom+0.0015,1.10)':d=${frames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          } else if (anim === 'zoom-out') {
            filterParts.push(`[${vIn}:v]${base},zoompan=z='if(eq(on,1),1.10,max(1.0,zoom-0.0015))':d=${frames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          } else if (anim === 'pan-left') {
            // Use `on` (output frame index) in zoompan expressions. `t` is not defined in zoompan.
            filterParts.push(`[${vIn}:v]${base},zoompan=z='1.05':x='(iw-ow)*on/${Math.max(1, frames - 1)}':y='(ih-oh)/2':d=${frames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          } else if (anim === 'pan-right') {
            filterParts.push(`[${vIn}:v]${base},zoompan=z='1.05':x='(iw-ow)*(1-on/${Math.max(1, frames - 1)})':y='(ih-oh)/2':d=${frames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          } else if (anim === 'pan-up') {
            filterParts.push(`[${vIn}:v]${base},zoompan=z='1.05':x='(iw-ow)/2':y='(ih-oh)*(1-on/${Math.max(1, frames - 1)})':d=${frames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          } else if (anim === 'pan-down') {
            filterParts.push(`[${vIn}:v]${base},zoompan=z='1.05':x='(iw-ow)/2':y='(ih-oh)*on/${Math.max(1, frames - 1)}':d=${frames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          } else if (anim === 'fade-in') {
            filterParts.push(`[${vIn}:v]${base},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.35[${out}]`)
          } else if (anim === 'fade-out') {
            const st = Math.max(0, Number((dur - 0.35).toFixed(2)))
            filterParts.push(`[${vIn}:v]${base},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS,fade=t=out:st=${st}:d=0.35[${out}]`)
          } else {
            filterParts.push(`[${vIn}:v]${base},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${out}]`)
          }

          labels.push(`[${out}]`)
          vIn++
        }

        filterParts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[vout]`)

        args = [
          ...inputs,
          '-filter_complex', filterParts.join(';'),
          '-map', '[vout]',
          '-map', `${audioIndex}:a`,
          '-c:v', 'libx264',
          '-preset', PRESETS[options.quality || 'standard'],
          '-crf', (options.quality || 'standard') === 'basic' ? '24' : (options.quality || 'standard') === 'pro' ? '21' : '23',
          '-b:v', BITRATES[options.quality || 'standard'],
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', (options.quality || 'standard') === 'basic' ? '160k' : '192k',
          ...(audioDur ? ['-t', String(Math.max(1, Math.round(audioDur * 100) / 100))] : []),
          '-shortest',
          '-movflags', '+faststart',
          '-y',
          outputFile,
        ]
      } else {
        // Simple concat demuxer approach
        const concatFile = path.join(workDir, 'input.txt')
        const lines: string[] = []

        project.storyboard.forEach((item, idx) => {
          const filename = imageFiles[idx]
          if (filename && fs.existsSync(path.join(workDir, filename))) {
            lines.push(`file '${filename}'`)
            lines.push(`duration ${durations[idx] || item.durationSec || defaultDuration}`)
          }
        })

        // FFmpeg concat demuxer quirk: repeat last file
        if (lines.length > 0) {
          const lastFile = lines[lines.length - 2]
          lines.push(lastFile)
        }

        fs.writeFileSync(concatFile, lines.join('\n'))

        const q = options.quality || 'standard'
        args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFile,
          '-i', audioInputPath,
          '-vf', filterString,
          '-c:v', 'libx264',
          '-preset', PRESETS[q],
          '-crf', q === 'basic' ? '24' : q === 'pro' ? '21' : '23',
          '-b:v', BITRATES[q],
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', q === 'basic' ? '160k' : '192k',
          ...(audioDur ? ['-t', String(Math.max(1, Math.round(audioDur * 100) / 100))] : []),
          '-shortest',
          '-movflags', '+faststart',
          '-y',
          outputFile,
        ]
      }

      const ffmpegPath = getFFmpegPath()
      console.log('Running FFmpeg:', ffmpegPath, args.join(' '))

      const proc = spawn(ffmpegPath, args, { cwd: workDir })

      let stderr = ''
      let lastProgress = 5

      let lastLogWrite = 0
      proc.stderr.on('data', async (data) => {
        const chunk = data.toString()
        stderr += chunk

        // keep last ~1500 chars for UI
        const tail = stderr.slice(-1500)

        // Parse and update progress
        const progress = parseFFmpegProgress(chunk, totalDurationSec)
        const now = Date.now()
        const shouldWriteLog = now - lastLogWrite > 1000

        if (progress !== null && progress > lastProgress) {
          lastProgress = progress
          await updateJobProgress(userId, job.renderId, progress, tail)
          lastLogWrite = now
        } else if (shouldWriteLog) {
          // update log tail even when time parsing doesn't advance
          await updateJobProgress(userId, job.renderId, lastProgress, tail)
          lastLogWrite = now
        }
      })

      await new Promise<void>((resolve) => {
        proc.on('close', async (code) => {
          if (code === 0) {
            console.log('Render success:', outputFile)
            try {
              const buf = fs.readFileSync(outputFile)
              const key = `renders/${job.projectId}/${job.renderId}.mp4`
              const blob = await put(key, buf, { access: 'public', contentType: 'video/mp4' })
              await updateJobStatus(userId, job.renderId, 'complete', blob.url)
            } catch (err) {
              // fallback: keep local path (may expire)
              const downloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/render/download?jobId=${job.renderId}`
              await updateJobStatus(userId, job.renderId, 'complete', downloadUrl, `Blob upload failed: ${(err as Error).message}`)
            }
          } else {
          console.error('Render failed with code', code)
          console.error('FFmpeg stderr:', stderr.slice(-500))
            await updateJobStatus(
              userId,
              job.renderId,
              'failed',
              undefined,
              `FFmpeg exited with code ${code}. Log: ${stderr.slice(-200)}`
            )
          }
          resolve()
        })

        proc.on('error', async (err) => {
          console.error('FFmpeg spawn error:', err)
          await updateJobStatus(userId, job.renderId, 'failed', undefined, err.message)
          resolve()
        })
      })
  } catch (err) {
    console.error('Render worker exception:', err)
    await updateJobStatus(userId, job.renderId, 'failed', undefined, (err as Error).message)
  }
}

// ============================================================================
// Crossfade Command Builder
// ============================================================================

function buildCrossfadeCommand(
  workDir: string,
  imageFiles: string[],
  durations: number[],
  animateFlags: boolean[],
  audioInput: string,
  outputFile: string,
  baseFilters: string,
  crossfadeDuration: number
): string[] {
  // For crossfade, we need to use a complex filtergraph
  // Each image is looped for its duration, then xfade is applied between them

  const inputs: string[] = []
  const filterParts: string[] = []

  // Add each image as a loop input
  for (let i = 0; i < imageFiles.length; i++) {
    const imgPath = path.join(workDir, imageFiles[i])
    const dur = durations[i] || 5
    inputs.push('-loop', '1', '-t', dur.toString(), '-i', imgPath)
  }

  // Add audio input
  inputs.push('-i', audioInput)

  // Pre-process each still image into a normalized stream (scale/pad) and optional simple animation.
  // This is required because xfade expects matching dimensions.
  const fps = 30
  const preLabels: string[] = []
  for (let i = 0; i < imageFiles.length; i++) {
    const dur = durations[i] || 5
    const dFrames = Math.max(1, Math.round(dur * fps))
    const label = `p${i}`

    if (animateFlags?.[i]) {
      // Simple Ken Burns zoom-in
      filterParts.push(
        `[${i}:v]${baseFilters},zoompan=z='min(zoom+0.0015,1.10)':d=${dFrames}:fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${label}]`
      )
    } else {
      filterParts.push(
        `[${i}:v]${baseFilters},fps=${fps},trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS[${label}]`
      )
    }

    preLabels.push(label)
  }

  // Build xfade chain
  // [p0][p1]xfade=transition=fade:duration=0.5:offset=... [v1];
  let prevLabel = preLabels[0]
  let offset = (durations[0] || 5) - crossfadeDuration

  for (let i = 1; i < imageFiles.length; i++) {
    const newLabel = `v${i}`
    filterParts.push(
      `[${prevLabel}][${preLabels[i]}]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset.toFixed(2)}[${newLabel}]`
    )
    prevLabel = newLabel
    if (i < imageFiles.length - 1) {
      offset += (durations[i] || 5) - crossfadeDuration
    }
  }

  const finalLabel = prevLabel
  filterParts.push(`[${finalLabel}]format=yuv420p[vout]`)

  const filterComplex = filterParts.join(';')
  const audioStreamIndex = imageFiles.length

  return [
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', `${audioStreamIndex}:a`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    ...(typeof audioInput === 'string' ? [] : []),
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    outputFile,
  ]
}
