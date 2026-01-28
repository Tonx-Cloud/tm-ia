import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadEnv } from './env.js'

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
export async function uploadToObjectStore(opts: {
  localPath: string
  key: string
}): Promise<{ url: string }> {
  const env = loadEnv()
  if (!env.STORAGE_BUCKET) {
    throw new Error('Storage not configured')
  }
  // TODO: integrate with S3 client (e.g., @aws-sdk/client-s3 or minio)
  throw new Error('Object storage not implemented')
}
