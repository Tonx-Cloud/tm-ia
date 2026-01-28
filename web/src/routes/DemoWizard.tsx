import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { checkDemoCooldown, uploadDemo, type DemoStatus } from '@/lib/api'
import { requestPreview } from '@/lib/preview'
import { t, type Locale } from '@/i18n'


export type DemoMetadata = {
  hookText?: string
  hookStart?: number
  hookEnd?: number
  mood?: string
  genre?: string
  previewDataUrl?: string
}

type WizardStage = 'upload' | 'transcribing' | 'hook' | 'preview'

const steps: { key: WizardStage; label: string; subtitle: string }[] = [
  { key: 'upload', label: 'Upload', subtitle: 'Áudio de até 15MB' },
  { key: 'transcribing', label: 'Transcribing', subtitle: 'Entendendo sua faixa' },
  { key: 'hook', label: 'Hook', subtitle: 'Selecionando o trecho-chave' },
  { key: 'preview', label: 'Preview', subtitle: 'Video demo de 5s' },
]

type Props = {
  locale?: Locale
  userId?: string | null
  authToken?: string
  onStatusChange?: (status: DemoStatus) => void
  onMetadata?: (meta: DemoMetadata) => void
  onAssets?: (assets: { id: string; prompt: string; status: 'generated' | 'reused' | 'needs_regen'; dataUrl: string }[]) => void
  onProjectChange?: (projectId: string) => void
  onError?: (msg: string) => void
}

export function DemoWizard({ locale = 'en', userId, authToken, onStatusChange, onMetadata, onAssets, onProjectChange, onError }: Props) {
  const [status, setStatus] = useState<DemoStatus>('idle')
  const [stage, setStage] = useState<WizardStage>('upload')
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [hook, setHook] = useState<string | undefined>()
  const [hookStyle, setHookStyle] = useState<string | undefined>()
  const [transcription, setTranscription] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(false)
  const [retryIn, setRetryIn] = useState<number | null>(null)
  const [lastUpload, setLastUpload] = useState<{ filename?: string; size?: number } | null>(null)
  const [authError, setAuthError] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const apiBase = import.meta.env.VITE_API_BASE || ''

  const currentStepIndex = steps.findIndex((s) => s.key === stage)
  const progressPct = status === 'ready' ? 100 : Math.max(0, ((currentStepIndex + 1) / steps.length) * 100)

  const stageCopy = useMemo(() => {
    if (errorMsg) return errorMsg
    switch (stage) {
      case 'upload':
        return t('copy.upload_sub', locale).replace('{limit}', '15MB')
      case 'transcribing':
        return t('state.processing', locale)
      case 'hook':
        return t('demo.hook.title', locale)
      case 'preview':
        return t('demo.preview.title', locale)
      default:
        return ''
    }
  }, [errorMsg, stage, locale])

  const handleBrowse = () => fileInputRef.current?.click()

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAuthError(false)
    void handleUpload(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setAuthError(false)
    void handleUpload(file)
  }

  const parseApiError = async (res: Response) => {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) {
      setAuthError(true)
      return t('error.auth', locale)
    }
    if (res.status === 429) {
      const retryAfter = body.retryAfter ?? body.retryAfterSeconds
      return `${body.error || 'Too many requests'}${retryAfter ? ` (${retryAfter}s)` : ''}`
    }
    return body.error || 'Erro ao processar demo'
  }

  const fetchTranscription = async (filePath: string) => {
    const res = await fetch(`${apiBase}/api/demo/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ filePath }),
    })
    if (!res.ok) throw new Error(await parseApiError(res))
    return res.json() as Promise<{ transcription: string; requestId?: string }>
  }

  const fetchHook = async (transcriptionText: string) => {
    const res = await fetch(`${apiBase}/api/demo/hook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ transcription: transcriptionText }),
    })
    if (!res.ok) throw new Error(await parseApiError(res))
    return res.json() as Promise<{ hook: string; style: string; requestId?: string }>
  }

  const resetFlow = () => {
    setHook(undefined)
    setHookStyle(undefined)
    setTranscription(null)
    setPreviewUrl(undefined)
    setErrorMsg(null)
  }

  const handleUpload = async (file?: File) => {
    if (!file || cooldown) return
    if (file.size > 15 * 1024 * 1024) {
      onError?.('Arquivo acima de 15MB')
      return
    }

    resetFlow()
    setCooldown(false)
    setRetryIn(null)
    setStatus('processing')
    onStatusChange?.('processing')
    setStage('upload')
    setLoading(true)

    try {
      const cooldownStatus = await checkDemoCooldown(authToken)
      if (cooldownStatus.unauth) {
        setAuthError(true)
        throw new Error(t('error.auth', locale))
      }
      if (cooldownStatus.blocked) {
        setCooldown(true)
        setRetryIn(cooldownStatus.retryInSeconds ?? null)
        throw new Error(t('error.cooldown', locale).replace('{minutes}', `${Math.ceil((cooldownStatus.retryInSeconds ?? 0) / 60)}`))
      }

      const uploadResp = await uploadDemo(file, authToken)
      setLastUpload({ filename: file.name, size: file.size })
      onProjectChange?.(uploadResp.projectId)

      setStage('transcribing')
      const transcribed = await fetchTranscription(uploadResp.filePath)
      setTranscription(transcribed.transcription)

      setStage('hook')
      const hookResp = await fetchHook(transcribed.transcription)
      setHook(hookResp.hook)
      setHookStyle(hookResp.style)

      setStage('preview')
      const previewResp = await requestPreview(uploadResp.filePath, hookResp.hook, hookResp.style, authToken)
      setPreviewUrl(previewResp.previewUrl)

      onMetadata?.({
        hookText: hookResp.hook,
        mood: hookResp.style,
        genre: hookResp.style,
        previewDataUrl: previewResp.previewUrl,
      })

      onAssets?.([
        {
          id: crypto.randomUUID(),
          prompt: `${hookResp.style} · ${hookResp.hook}`,
          status: 'generated',
          dataUrl: previewResp.previewUrl,
        },
      ])

      setStatus('ready')
      onStatusChange?.('ready')
    } catch (err) {
      const message = (err as Error).message || 'Erro ao processar demo'
      setErrorMsg(message)
      onError?.(message)
      setStatus('idle')
      onStatusChange?.('idle')
      setStage('upload')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="hero" style={{ marginBottom: '20px' }}>
      <div className="badge-soft">{t('badge.demo', locale)} · 5s · {t('badge.low_res', locale)}</div>
      <h1>{t('copy.hero_title', locale)}</h1>
      <p>{t('copy.hero_sub', locale)}</p>

      <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 12 }}>
            {steps.map((step, idx) => {
              const isDone = status === 'ready' || idx < currentStepIndex
              const isActive = idx === currentStepIndex && status !== 'ready'
              return (
                <div key={step.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '999px',
                      display: 'grid',
                      placeItems: 'center',
                      background: isDone ? 'var(--accent-gradient)' : isActive ? 'rgba(180,59,255,0.2)' : 'transparent',
                      border: isDone || isActive ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--border)',
                      color: isDone ? '#fff' : 'var(--text-muted)',
                      fontWeight: 700,
                    }}
                  >
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{step.label}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{step.subtitle}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'var(--accent-gradient)',
                transition: 'width 240ms ease',
              }}
            />
          </div>
          <div className="badge-soft">{stageCopy}</div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowse}
          style={{
            border: '1px dashed var(--border)',
            borderRadius: '14px',
            padding: '20px',
            background: dragOver ? 'rgba(180,59,255,0.08)' : 'transparent',
            cursor: 'pointer',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700 }}>{t('copy.upload_title', locale)}</div>
          <div style={{ color: 'var(--text-muted)' }}>{t('copy.upload_sub', locale).replace('{limit}', '15MB')}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-primary" type="button" disabled={loading} onClick={handleBrowse}>
              {loading ? t('state.processing', locale) : t('cta.create_demo', locale)}
            </button>
            <button className="btn-ghost" type="button" disabled={cooldown || loading} onClick={handleBrowse}>
              {t('cta.retry_demo', locale)}
            </button>
          </div>
          {cooldown && (
            <div style={{ color: 'var(--text-muted)' }}>
              {t('error.cooldown', locale).replace('{minutes}', `${Math.ceil((retryIn ?? 0) / 60)}`)}
            </div>
          )}
        </div>

        {(!userId || authError) && (
          <div className="card" style={{ marginTop: 4, borderColor: '#ff4d6d', color: '#ffb3c0' }}>
            {t('error.auth', locale)}
          </div>
        )}

        {lastUpload && (
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Upload salvo</div>
              <div style={{ color: 'var(--text-muted)' }}>
                {lastUpload.filename} · {(lastUpload.size ?? 0) / 1024 / 1024 >= 1
                  ? `${(lastUpload.size ?? 0) / 1024 / 1024}`.slice(0, 4) + 'MB'
                  : `${Math.round((lastUpload.size ?? 0) / 1024)}KB`}
              </div>
            </div>
            <div className="badge-soft">{status === 'processing' ? t('state.processing', locale) : 'Upload done'}</div>
          </div>
        )}

        {errorMsg && (
          <div className="card" style={{ borderColor: '#ff4d6d', color: '#ffb3c0' }}>
            {errorMsg}
          </div>
        )}

        {transcription && (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Transcription</div>
            <div style={{ color: 'var(--text-muted)' }}>{transcription}</div>
          </div>
        )}

        {hook && (
          <div className="card" style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 700 }}>{t('demo.hook.title', locale)}</div>
            <div style={{ color: 'var(--text-muted)' }}>{hook}</div>
            {hookStyle && <div className="badge-soft">{t('demo.hook.style', locale).replace('{{style}}', hookStyle)}</div>}
          </div>
        )}

        {previewUrl && (
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{t('demo.preview.title', locale)}</div>
              <div className="badge-soft">5s · Watermark</div>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: '#0b0b12' }}>
              <video src={previewUrl} controls style={{ width: '100%', display: 'block' }} poster={previewUrl} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn-primary" type="button">
                {t('demo.preview.unlock', locale)}
              </button>
              <button className="btn-ghost" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                {t('cta.view_paywall', locale)}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
