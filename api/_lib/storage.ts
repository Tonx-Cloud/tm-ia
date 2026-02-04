import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadEnv } from './env.js'
import { putBufferToR2 } from './r2.js'
import { uploadLocalFileToS3 } from './s3.js'

export function ensureTempFile(filePath: string) {
  const resolved = path.resolve(filePath)
  const tempDir = os.tmpdir()
  
  // Allow paths in system temp directory (works on Windows and Linux)
  const isInTempDir = resolved.toLowerCase().startsWith(tempDir.toLowerCase()) ||
    resolved.startsWith('/tmp') ||
    resolved.includes('\\Temp\\') ||
    resolved.includes('/tmp/')
  
  if (!isInTempDir) {
    throw new Error('Invalid temp path')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Temp file not found')
  }
  return resolved
}

// Stub for S3-compatible upload
function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.mp3': return 'audio/mpeg'
    case '.wav': return 'audio/wav'
    case '.m4a': return 'audio/mp4'
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.json': return 'application/json'
    case '.txt': return 'text/plain'
    default: return 'application/octet-stream'
  }
}

function hasR2Env(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_PUBLIC_BASE_URL
  )
}

function hasS3Env(): boolean {
  return Boolean(
    process.env.STORAGE_BUCKET &&
    process.env.STORAGE_REGION &&
    process.env.STORAGE_ACCESS_KEY &&
    process.env.STORAGE_SECRET_KEY
  )
}

export async function uploadToObjectStore(opts: {
  localPath: string
  key: string
  contentType?: string
}): Promise<{ url: string }> {
  loadEnv()

  const resolved = ensureTempFile(opts.localPath)
  const contentType = opts.contentType || guessContentType(resolved)

  if (hasR2Env()) {
    const buf = fs.readFileSync(resolved)
    return putBufferToR2(opts.key, buf, contentType)
  }

  if (hasS3Env()) {
    return uploadLocalFileToS3(resolved, opts.key, contentType)
  }

  throw new Error('Storage not configured')
}
