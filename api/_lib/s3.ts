import fs from 'fs'
import path from 'path'
import { loadEnv } from './env.js'

type S3Deps = {
  S3Client: any
  PutObjectCommand: any
  getSignedUrl: any
}

let deps: S3Deps | null = null
let client: any = null

async function ensureDeps(): Promise<S3Deps> {
  if (deps) return deps
  try {
    const s3Module = await import('@aws-sdk/client-s3')
    const presigner = await import('@aws-sdk/s3-request-presigner')
    deps = {
      S3Client: s3Module.S3Client,
      PutObjectCommand: s3Module.PutObjectCommand,
      getSignedUrl: presigner.getSignedUrl,
    }
    return deps
  } catch (err) {
    throw new Error('S3 SDK not installed')
  }
}

async function getClient() {
  if (client) return client
  const { S3Client } = await ensureDeps()
  const env = loadEnv()
  if (!env.STORAGE_ACCESS_KEY || !env.STORAGE_SECRET_KEY || !env.STORAGE_REGION) {
    throw new Error('Storage credentials missing')
  }
  client = new S3Client({
    region: env.STORAGE_REGION,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
    },
  })
  return client
}

export async function uploadLocalFileToS3(localPath: string, key: string, mime?: string) {
  const env = loadEnv()
  if (!env.STORAGE_BUCKET) {
    throw new Error('STORAGE_BUCKET not set')
  }
  const resolved = path.resolve(localPath)
  const body = fs.createReadStream(resolved)
  const { PutObjectCommand } = await ensureDeps()
  const s3 = await getClient()
  await s3.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      Body: body,
      ContentType: mime,
      ACL: 'public-read',
    }),
  )
  const publicUrl = `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION}.amazonaws.com/${key}`
  return { url: publicUrl }
}

export async function getSignedUrlForKey(key: string, expiresIn = 3600) {
  const env = loadEnv()
  if (!env.STORAGE_BUCKET) throw new Error('STORAGE_BUCKET not set')
  const { PutObjectCommand, getSignedUrl } = await ensureDeps()
  const s3 = await getClient()
  const cmd = new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key })
  return getSignedUrl(s3, cmd, { expiresIn })
}
