import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { getFFmpegPath } from './ffmpegPath.js'
import { getProject } from './projectStore.js'
import { prisma } from './prisma.js'
import { type RenderJob } from './renderPipeline.js'
import { putBufferToR2 } from './r2.js'

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

const _BITRATES: Record<RenderQuality, string> = {
  basic: '2500k',
  standard: '5000k',
  pro: '8000k',
}

const _PRESETS: Record<RenderQuality, string> = {
  basic: 'veryfast',
  standard: 'fast',
  pro: 'medium', // Slower, better compression
}

const DOWNLOAD_TIMEOUT_MS = 60_000

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

function _parseFFmpegProgress(stderr: string, totalDurationSec: number): number | null {
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
// Download Helpers (with timeout)
// ============================================================================

async function fetchWithTimeout(url: string, timeoutMs: number, label: string) {
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: ac.signal })
    if (!resp.ok) throw new Error(`${label} download failed (${resp.status})`)
    return resp
  } catch (err) {
    if ((err as any)?.name === 'AbortError') {
      throw new Error(`${label} download timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

async function downloadToFile(url: string, filePath: string, timeoutMs: number, label: string) {
  const resp = await fetchWithTimeout(url, timeoutMs, label)
  fs.writeFileSync(filePath, Buffer.from(await resp.arrayBuffer()))
}

// ============================================================================
// Video Filter Construction
// ============================================================================

function _buildVideoFilters(options: RenderOptions): string[] {
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

function getWatermarkFilter(options: RenderOptions): string {
  if (!options.watermark) return ''
  return `drawtext=text='TM-IA DEMO':fontsize=48:fontcolor=white@0.4:x=w-tw-20:y=h-th-20:shadowcolor=black@0.3:shadowx=2:shadowy=2`
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
// Main Render Function (Refactored: Sequential Clip Generation + Concat)
// ============================================================================

export async function startFFmpegRender(userId: string, job: RenderJob, options: RenderOptions = {}) {
  await updateJobStatus(userId, job.renderId, 'processing')

  const tmpDir = os.tmpdir()
  const workDir = path.join(tmpDir, `render_${job.renderId}`)
  const tempFiles: string[] = []
  const shouldCleanupWorkDir = true

  try {
    const project = await getProject(job.projectId)
    if (!project) throw new Error('Project not found')

    // 1. Prepare Workspace
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir)

    // 2. Prepare Audio
    let audioInput = ''
    if (project.audioUrl) {
      const workAudio = path.join(tmpDir, `audio_${job.renderId}.bin`)
      await downloadToFile(project.audioUrl, workAudio, DOWNLOAD_TIMEOUT_MS, 'Audio')
      audioInput = workAudio
      tempFiles.push(workAudio)
    } else if (project.audioData) {
      const workAudio = path.join(tmpDir, `audio_${job.renderId}.bin`)
      fs.writeFileSync(workAudio, Buffer.from(project.audioData, 'base64'))
      audioInput = workAudio
      tempFiles.push(workAudio)
    } else if (project.audioPath && fs.existsSync(project.audioPath)) {
      audioInput = project.audioPath
    }
    if (!audioInput) throw new Error('Audio file missing')

    // 3. Resolve Resolution & FPS
    const quality = options.quality || 'standard'
    const format = options.format || 'horizontal'
    const res = RESOLUTIONS[quality][format]
    const fps = 30
    const ffmpegPath = getFFmpegPath()
    const watermarkFilter = getWatermarkFilter(options)

    // 4. Generate Clips Sequentially
    // Using simple clip generation avoids "filter_complex" complexity and guarantees resolution/animation correctness per scene.
    const clipFiles: string[] = []
    const storyboard = project.storyboard || []
    
    // Fallback if storyboard is empty but assets exist
    if (storyboard.length === 0 && project.assets.length > 0) {
       project.assets.forEach(a => storyboard.push({ assetId: a.id, durationSec: 5, animate: false }))
    }

    let totalDurationSec = 0
    storyboard.forEach(s => totalDurationSec += (s.durationSec || 5))

    let currentProgressDuration = 0

    // Debug Log Header
    const sbLog = summarizeStoryboardForLog(project)
    const header = `TM-IA render (sequential)\nformat=${format} quality=${quality} (${res.width}x${res.height})\nscenes=${storyboard.length}\n${sbLog}\n`
    await updateJobProgress(userId, job.renderId, 5, header)

    const hasAnimatedVideo = storyboard.some(s => {
      const asset: any = project.assets.find(a => a.id === s.assetId)
      return asset?.animation?.status === 'completed' && asset?.animation?.videoUrl
    })

    const shouldUseCrossfade = Boolean(options.crossfade) && storyboard.length > 1 && !hasAnimatedVideo

    if (shouldUseCrossfade) {
      // Crossfade path (still images only)
      const imageFiles: string[] = []
      const durations: number[] = []
      const animateFlags: boolean[] = []

      for (let i = 0; i < storyboard.length; i++) {
        const item = storyboard[i]
        const asset: any = project.assets.find(a => a.id === item.assetId)
        if (!asset?.dataUrl) continue

        const m = asset.dataUrl.match(/^data:(image\/[^;]+);base64,(.*)$/)
        if (!m) continue
        const ext = m[1].includes('png') ? 'png' : 'jpg'
        const imgName = `src_${i}.${ext}`
        const imgPath = path.join(workDir, imgName)
        fs.writeFileSync(imgPath, m[2], 'base64')

        const anim = String((item as any).animateType || (item as any).animation || (item.animate ? 'zoom-in' : 'none'))
        imageFiles.push(imgName)
        durations.push(item.durationSec || 5)
        animateFlags.push(anim !== 'none')
      }

      if (imageFiles.length > 0) {
        const baseFilters = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`
        const finalOutput = path.join(workDir, 'output.mp4')
        const args = buildCrossfadeCommand(
          workDir,
          imageFiles,
          durations,
          animateFlags,
          audioInput,
          finalOutput,
          baseFilters,
          options.crossfadeDuration ?? 0.5,
          watermarkFilter
        )

        await new Promise<void>((resolve, reject) => {
          const p = spawn(ffmpegPath, args)
          let stderr = ''
          p.stderr.on('data', d => stderr += d.toString())
          p.on('close', c => {
            if (c === 0) resolve()
            else reject(new Error(`Crossfade render failed: ${stderr.slice(-500)}`))
          })
        })

        // 6. Upload
        console.log('Render success (crossfade):', finalOutput)
        try {
          const buf = fs.readFileSync(finalOutput)
          const key = `renders/${job.projectId}/${job.renderId}.mp4`
          const obj = await putBufferToR2(key, buf, 'video/mp4')
          await updateJobStatus(userId, job.renderId, 'complete', obj.url)
        } catch (err) {
          const downloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/render/download?jobId=${job.renderId}`
          await updateJobStatus(userId, job.renderId, 'complete', downloadUrl, `Upload failed: ${(err as Error).message}`)
        }

        return
      }
    }

    for (let i = 0; i < storyboard.length; i++) {
      const item = storyboard[i]
      const asset: any = project.assets.find(a => a.id === item.assetId)
      if (!asset) continue

      const dur = item.durationSec || 5
      const frames = Math.max(1, Math.round(dur * fps))
      const anim = String((item as any).animateType || (item as any).animation || (item.animate ? 'zoom-in' : 'none'))
      const clipName = `clip_${String(i).padStart(3, '0')}.mp4`
      const clipPath = path.join(workDir, clipName)

      // If this asset has a completed video animation (Veo / external), render should use the VIDEO.
      // Otherwise, fall back to still-image + simple FFmpeg animation.
      const videoUrl = asset?.animation?.status === 'completed' ? asset?.animation?.videoUrl : undefined

      // Build common scale filter
      const scaleFilter = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps}`

      if (videoUrl && /^https?:\/\//i.test(videoUrl)) {
        // Download the video to local temp (serverless-safe)
        const vidPath = path.join(workDir, `src_${i}.mp4`)
        await downloadToFile(videoUrl, vidPath, DOWNLOAD_TIMEOUT_MS, `Video scene ${i + 1}`)

        // Loop the clip if needed to reach dur, then scale/pad
        let vf = `${scaleFilter}`
        if (watermarkFilter) vf += `,${watermarkFilter}`
        const args = [
          '-stream_loop', '-1',
          '-i', vidPath,
          '-t', dur.toFixed(2),
          '-vf', vf,
          '-an',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-y', clipPath,
        ]

        await new Promise<void>((resolve, reject) => {
          const p = spawn(ffmpegPath, args)
          p.on('close', c => c === 0 ? resolve() : reject(new Error(`Clip ${i} (video) failed`)))
          p.on('error', reject)
        })

      } else {
        if (!asset.dataUrl) continue

        // Save Image
        const m = asset.dataUrl.match(/^data:(image\/[^;]+);base64,(.*)$/)
        if (!m) continue
        const ext = m[1].includes('png') ? 'png' : 'jpg'
        const imgPath = path.join(workDir, `src_${i}.${ext}`)
        fs.writeFileSync(imgPath, m[2], 'base64')

        // Build Filter for this specific clip (simple animation)
        const sizeStr = `s=${res.width}x${res.height}`
        let vf = `${scaleFilter}`

        if (anim === 'zoom-in') {
          vf += `,zoompan=z='min(zoom+0.0015,1.10)':d=${frames}:fps=${fps}:${sizeStr}`
        } else if (anim === 'zoom-out') {
          vf += `,zoompan=z='if(eq(on,1),1.10,max(1.0,zoom-0.0015))':d=${frames}:fps=${fps}:${sizeStr}`
        } else if (anim === 'pan-left') {
          vf += `,zoompan=z='1.05':x='(iw-ow)*on/${Math.max(1, frames - 1)}':y='(ih-oh)/2':d=${frames}:fps=${fps}:${sizeStr}`
        } else if (anim === 'pan-right') {
          vf += `,zoompan=z='1.05':x='(iw-ow)*(1-on/${Math.max(1, frames - 1)})':y='(ih-oh)/2':d=${frames}:fps=${fps}:${sizeStr}`
        } else if (anim === 'pan-up') {
          vf += `,zoompan=z='1.05':x='(iw-ow)/2':y='(ih-oh)*(1-on/${Math.max(1, frames - 1)})':d=${frames}:fps=${fps}:${sizeStr}`
        } else if (anim === 'pan-down') {
          vf += `,zoompan=z='1.05':x='(iw-ow)/2':y='(ih-oh)*on/${Math.max(1, frames - 1)}':d=${frames}:fps=${fps}:${sizeStr}`
        } else if (anim === 'fade-in') {
          vf += `,fade=t=in:st=0:d=0.5`
        } else if (anim === 'fade-out') {
          vf += `,fade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5`
        }

        // Safety scale again to catch zoompan resets
        vf += `,scale=${res.width}:${res.height}`
        if (watermarkFilter) vf += `,${watermarkFilter}`

        const args = [
          '-loop', '1',
          '-t', dur.toFixed(2),
          '-i', imgPath,
          '-vf', vf,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-y', clipPath
        ]

        await new Promise<void>((resolve, reject) => {
          const p = spawn(ffmpegPath, args)
          p.on('close', c => c === 0 ? resolve() : reject(new Error(`Clip ${i} failed`)))
          p.on('error', reject)
        })
      }

      clipFiles.push(clipPath)
      
      // Update Progress based on clips done
      currentProgressDuration += dur
      const pct = Math.min(90, Math.round((currentProgressDuration / totalDurationSec) * 90))
      await updateJobProgress(userId, job.renderId, pct, (header + `\nClip ${i + 1}/${storyboard.length} done`).slice(-2000))
    }

    if (clipFiles.length === 0) throw new Error('No clips generated')

    // 5. Concat Clips + Audio
    const concatList = path.join(workDir, 'concat.txt')
    const lines = clipFiles.map(f => `file '${f}'`)
    fs.writeFileSync(concatList, lines.join('\n'))

    const finalOutput = path.join(workDir, 'output.mp4')
    // We encode again to combine with audio and ensure final bitrate/profile
    const concatArgs = [
      '-f', 'concat', '-safe', '0',
      '-i', concatList,
      '-i', audioInput,
      '-c:v', 'copy', // Copy video stream (fast!) since clips are already correct
      '-c:a', 'aac', '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      '-y', finalOutput
    ]

    console.log('Running Final Concat:', ffmpegPath, concatArgs.join(' '))
    
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpegPath, concatArgs)
      let stderr = ''
      p.stderr.on('data', d => stderr += d.toString())
      p.on('close', c => {
        if (c === 0) resolve()
        else reject(new Error(`Final concat failed: ${stderr.slice(-500)}`))
      })
    })

    // 6. Upload
    console.log('Render success:', finalOutput)
    try {
      const buf = fs.readFileSync(finalOutput)
      const key = `renders/${job.projectId}/${job.renderId}.mp4`
      const obj = await putBufferToR2(key, buf, 'video/mp4')
      await updateJobStatus(userId, job.renderId, 'complete', obj.url)
    } catch (err) {
      const downloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/render/download?jobId=${job.renderId}`
      await updateJobStatus(userId, job.renderId, 'complete', downloadUrl, `Upload failed: ${(err as Error).message}`)
    }

  } catch (err) {
    console.error('Render worker exception:', err)
    await updateJobStatus(userId, job.renderId, 'failed', undefined, (err as Error).message)
  } finally {
    // Best-effort cleanup
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f)
      } catch {
        // ignore
      }
    }
    if (shouldCleanupWorkDir) {
      cleanupRenderJob(job.renderId)
    }
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
  crossfadeDuration: number,
  watermarkFilter?: string
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
  const finalFilters = [watermarkFilter, 'format=yuv420p'].filter(Boolean).join(',')
  filterParts.push(`[${finalLabel}]${finalFilters}[vout]`)

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
