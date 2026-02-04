import { GoogleAuth } from 'google-auth-library'
import { loadEnv } from './env.js'

// Types for Veo API
export type VeoStartResult = {
  operationName?: string
  videoUrl?: string
}

type VeoResponse = {
  name?: string
  predictions?: Array<{
    generatedSamples?: Array<{
      video: {
        uri: string
        mimeType: string
      }
    }>
  }>
  metadata?: any
  error?: {
    code: number
    message: string
  }
}

type VeoOperation = {
  name: string
  done: boolean
  response?: {
    generatedSamples?: Array<{
      video: {
        uri: string
        mimeType: string
      }
    }>
  }
  error?: {
    code: number
    message: string
  }
}

export class VeoClient {
  private auth: GoogleAuth
  private project: string
  private location: string

  constructor() {
    const env = loadEnv()
    this.project = env.GCLOUD_PROJECT || ''
    this.location = env.GCLOUD_LOCATION || 'us-central1'

    const credentialsJson = env.GOOGLE_APPLICATION_CREDENTIALS_JSON

    if (credentialsJson) {
      // Use provided JSON credentials
      let credentials
      try {
        credentials = JSON.parse(credentialsJson)
      } catch (e) {
        console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON', e)
      }

      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      })
    } else {
      // Fallback to default (ADC) or other env vars
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      })
    }
  }

  async generateVideo(params: {
    prompt: string
    imageGcsUri?: string
    imageBase64?: string
    aspectRatio?: '16:9' | '9:16'
  }): Promise<VeoStartResult> {
    if (!this.project) throw new Error('GCLOUD_PROJECT not configured')

    const client = await this.auth.getClient()
    const token = await client.getAccessToken()

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.project}/locations/${this.location}/publishers/google/models/veo-2.0-generate-001:predict`

    const instance: any = {
      prompt: params.prompt,
    }

    if (params.imageGcsUri) {
      instance.image = { gcsUri: params.imageGcsUri }
    } else if (params.imageBase64) {
      instance.image = { bytesBase64Encoded: params.imageBase64 }
    }

    const payload = {
      instances: [instance],
      parameters: {
        aspectRatio: params.aspectRatio || '16:9',
        sampleCount: 1,
        storageUri: `gs://${process.env.STORAGE_BUCKET || this.project + '-veo-outputs'}`,
      },
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Veo API Error (${res.status}): ${txt}`)
    }

    const data = (await res.json()) as VeoResponse

    if (data.error) {
      throw new Error(`Veo API Error: ${data.error.message}`)
    }

    if (data.name) {
      return { operationName: data.name }
    }

    const directUri = data.predictions?.[0]?.generatedSamples?.[0]?.video?.uri
    if (directUri) {
      return { videoUrl: directUri }
    }

    throw new Error('Unexpected Veo response (no operation or video URI)')
  }

  async checkOperation(operationName: string): Promise<VeoOperation> {
    if (!this.project) throw new Error('GCLOUD_PROJECT not configured')

    const client = await this.auth.getClient()
    const token = await client.getAccessToken()

    const opPath = operationName.startsWith('projects/')
      ? operationName
      : `projects/${this.project}/locations/${this.location}/publishers/google/models/veo-2.0-generate-001/operations/${operationName}`

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${opPath}`

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.token}` },
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Veo operation error (${res.status}): ${txt}`)
    }

    return (await res.json()) as VeoOperation
  }
}
