import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleUpload } from '@vercel/blob/client'
import { getSession } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'

// Client-side uploads for large audio files.
// The browser requests an upload token here; the file then uploads directly to Vercel Blob.

export const config = {
  api: {
    bodyParser: false,
  },
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  // handleUpload expects the parsed JSON body (it supports 2 message types: token generation and completion callback).
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk as any))
  const raw = Buffer.concat(chunks).toString('utf8')
  const body = JSON.parse(raw || '{}')

  const json = await handleUpload({
    request: req as any,
    body,
    onBeforeGenerateToken: async (pathname: string) => {
      // Lock down uploads to the audio/ prefix.
      if (!pathname.startsWith('audio/')) {
        throw new Error('Invalid upload path')
      }
      return {
        allowedContentTypes: ['audio/*'],
        tokenPayload: JSON.stringify({ userId: session.userId, requestId: ctx.requestId }),
        maximumSizeInBytes: 250 * 1024 * 1024, // 250MB
      }
    },
    onUploadCompleted: async ({ blob }: { blob: { url: string; pathname: string } }) => {
      ctx.log('info', 'blob.upload.completed', { url: blob.url, pathname: blob.pathname })
    },
  })

  return res.status(200).json(json)
})
