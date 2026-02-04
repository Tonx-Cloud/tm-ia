import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { loadEnv } from './env.js'

function clean(v: string): string {
  return v.trim().replace(/[\r\n]+/g, '')
}

function must(key: string, v?: string) {
  if (!v) throw new Error(`Missing env var: ${key}`)
  return clean(v)
}

export type R2Env = {
  R2_ACCOUNT_ID: string
  R2_BUCKET: string
  R2_ACCESS_KEY_ID: string
  R2_SECRET_ACCESS_KEY: string
  R2_PUBLIC_BASE_URL: string
}

export function loadR2Env(): R2Env {
  loadEnv()
  return {
    R2_ACCOUNT_ID: must('R2_ACCOUNT_ID', process.env.R2_ACCOUNT_ID),
    R2_BUCKET: must('R2_BUCKET', process.env.R2_BUCKET),
    R2_ACCESS_KEY_ID: must('R2_ACCESS_KEY_ID', process.env.R2_ACCESS_KEY_ID),
    R2_SECRET_ACCESS_KEY: must('R2_SECRET_ACCESS_KEY', process.env.R2_SECRET_ACCESS_KEY),
    R2_PUBLIC_BASE_URL: must('R2_PUBLIC_BASE_URL', process.env.R2_PUBLIC_BASE_URL),
  }
}

let _client: S3Client | null = null

export function getR2Client(): S3Client {
  if (_client) return _client
  const env = loadR2Env()
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
  return _client
}

export function getPublicUrl(key: string): string {
  const env = loadR2Env()
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
}

export async function putBufferToR2(key: string, buf: Buffer, contentType?: string) {
  const env = loadR2Env()
  const client = getR2Client()

  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: buf,
      ContentType: contentType,
    })
  )

  return { url: getPublicUrl(key), key }
}

export async function presignPutToR2(key: string, contentType: string, expiresSec = 900) {
  const env = loadR2Env()
  const client = getR2Client()

  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: expiresSec })

  return { uploadUrl, publicUrl: getPublicUrl(key), key }
}
