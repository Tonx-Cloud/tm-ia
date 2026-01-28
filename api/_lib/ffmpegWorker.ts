import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { getProject } from './projectStore.js'
import { type RenderJob, loadJobs, saveJobs } from './jobStore.js'

// ============================================================================
// Types
// ============================================================================

export type RenderFormat = 'vertical' | 'horizontal' | 'square'

export type RenderOptions = {
  format?: RenderFormat
  watermark?: boolean
  crossfade?: boolean
  crossfadeDuration?: number // seconds
}

type FormatConfig = {
  width: number
  height: number
  label: string
}

const FORMAT_CONFIGS: Record<RenderFormat, FormatConfig> = {
  vertical: { width: 1080, height: 1920, label: '9:16 (TikTok/Reels)' },
  horizontal: { width: 1920, height: 1080, label: '16:9 (YouTube)' },
  square: { width: 1080, height: 1080, label: '1:1 (Instagram)' },
}

// ============================================================================
// Job Status Management
// ============================================================================

function updateJobStatus(
  userId: string,
  renderId: string,
  status: RenderJob['status'],
  outputUrl?: string,
  error?: string
) {
  const jobs = loadJobs(userId)
  const idx = jobs.findIndex((j) => j.renderId === renderId)
  if (idx >= 0) {
    jobs[idx].status = status
    jobs[idx].updatedAt = Date.now()
    if (outputUrl) jobs[idx].outputUrl = outputUrl
    if (error) jobs[idx].error = error
    if (status === 'processing') jobs[idx].progress = 5
    if (status === 'complete') jobs[idx].progress = 100
    saveJobs(userId, jobs)
  }
}

function updateJobProgress(userId: string, renderId: string, progress: number) {
  const jobs = loadJobs(userId)
  const idx = jobs.findIndex((j) => j.renderId === renderId)
  if (idx >= 0 && jobs[idx].status === 'processing') {
    jobs[idx].progress = Math.min(99, Math.max(5, progress))
    jobs[idx].updatedAt = Date.now()
    saveJobs(userId, jobs)
  }
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
  const config = FORMAT_CONFIGS[format]

  // 1. Scale to target resolution with padding (letterbox/pillarbox)
  // This ensures all images fit the target aspect ratio
  filters.push(
    `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease`,
    `pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:black`
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

// ============================================================================
// Main Render Function
// ============================================================================

export function startFFmpegRender(userId: string, job: RenderJob, options: RenderOptions = {}) {
  // Update status to processing immediately
  updateJobStatus(userId, job.renderId, 'processing')

  // Run in background (next tick) to not block the API response
  setTimeout(async () => {
    try {
      const project = getProject(job.projectId)
      if (!project) throw new Error('Project not found')

      if (!project.audioPath || !fs.existsSync(project.audioPath)) {
        throw new Error('Audio file missing')
      }

      const tmpDir = os.tmpdir()
      const workDir = path.join(tmpDir, `render_${job.renderId}`)
      if (!fs.existsSync(workDir)) fs.mkdirSync(workDir)

      // 1. Extract Images from storyboard
      const imageFiles: string[] = []
      for (const [index, item] of project.storyboard.entries()) {
        const asset = project.assets.find((a) => a.id === item.assetId)
        if (!asset || !asset.dataUrl) continue

        const base64Data = asset.dataUrl.replace(/^data:image\/\w+;base64,/, '')
        const filename = `frame_${index.toString().padStart(3, '0')}.png`
        const filePath = path.join(workDir, filename)
        fs.writeFileSync(filePath, base64Data, 'base64')
        imageFiles.push(filename)
      }

      if (imageFiles.length === 0) throw new Error('No images to render')

      // 2. Calculate total duration for progress tracking
      const defaultDuration = 5
      let totalDurationSec = 0
      const durations: number[] = []

      for (const item of project.storyboard) {
        const dur = item.durationSec || defaultDuration
        durations.push(dur)
        totalDurationSec += dur
      }

      // 3. Build FFmpeg command based on whether crossfade is enabled
      const outputFile = path.join(workDir, 'output.mp4')
      const audioInput = project.audioPath
      const videoFilters = buildVideoFilters(options)
      const filterString = videoFilters.join(',')

      let args: string[]

      if (options.crossfade && imageFiles.length > 1) {
        // Complex filtergraph for crossfade transitions
        const crossfadeDur = options.crossfadeDuration || 0.5
        args = buildCrossfadeCommand(workDir, imageFiles, durations, audioInput, outputFile, filterString, crossfadeDur)
      } else {
        // Simple concat demuxer approach
        const concatFile = path.join(workDir, 'input.txt')
        const lines: string[] = []

        project.storyboard.forEach((item, idx) => {
          const filename = `frame_${idx.toString().padStart(3, '0')}.png`
          if (fs.existsSync(path.join(workDir, filename))) {
            lines.push(`file '${filename}'`)
            lines.push(`duration ${item.durationSec || defaultDuration}`)
          }
        })

        // FFmpeg concat demuxer quirk: repeat last file
        if (lines.length > 0) {
          const lastFile = lines[lines.length - 2]
          lines.push(lastFile)
        }

        fs.writeFileSync(concatFile, lines.join('\n'))

        args = [
          '-f', 'concat',
          '-safe', '0',
          '-i', concatFile,
          '-i', audioInput,
          '-vf', filterString,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-movflags', '+faststart',
          '-y',
          outputFile,
        ]
      }

      console.log('Running FFmpeg:', 'ffmpeg', args.join(' '))

      const proc = spawn('ffmpeg', args, { cwd: workDir })

      let stderr = ''
      let lastProgress = 5

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        
        // Parse and update progress
        const progress = parseFFmpegProgress(data.toString(), totalDurationSec)
        if (progress !== null && progress > lastProgress) {
          lastProgress = progress
          updateJobProgress(userId, job.renderId, progress)
        }
      })

      proc.on('close', (code) => {
        if (code === 0) {
          console.log('Render success:', outputFile)
          const downloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/api/render/download?jobId=${job.renderId}`
          updateJobStatus(userId, job.renderId, 'complete', downloadUrl)
        } else {
          console.error('Render failed with code', code)
          console.error('FFmpeg stderr:', stderr.slice(-500))
          updateJobStatus(
            userId,
            job.renderId,
            'failed',
            undefined,
            `FFmpeg exited with code ${code}. Log: ${stderr.slice(-200)}`
          )
        }
      })

      proc.on('error', (err) => {
        console.error('FFmpeg spawn error:', err)
        updateJobStatus(userId, job.renderId, 'failed', undefined, err.message)
      })
    } catch (err) {
      console.error('Render worker exception:', err)
      updateJobStatus(userId, job.renderId, 'failed', undefined, (err as Error).message)
    }
  }, 100)
}

// ============================================================================
// Crossfade Command Builder
// ============================================================================

function buildCrossfadeCommand(
  workDir: string,
  imageFiles: string[],
  durations: number[],
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

  // Build xfade chain
  // [0:v][1:v]xfade=transition=fade:duration=0.5:offset=4.5[v01];
  // [v01][2:v]xfade=transition=fade:duration=0.5:offset=9[v012]; etc.
  
  let prevLabel = '0:v'
  let offset = durations[0] - crossfadeDuration

  for (let i = 1; i < imageFiles.length; i++) {
    const newLabel = `v${i}`
    filterParts.push(
      `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset.toFixed(2)}[${newLabel}]`
    )
    prevLabel = newLabel
    if (i < imageFiles.length - 1) {
      offset += durations[i] - crossfadeDuration
    }
  }

  // Apply base filters (scale, watermark) to final video
  const finalLabel = prevLabel
  filterParts.push(`[${finalLabel}]${baseFilters}[vout]`)

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
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    outputFile,
  ]
}
