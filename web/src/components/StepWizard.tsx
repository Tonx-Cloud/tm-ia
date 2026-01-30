import { useState, useEffect, useRef } from 'react'
import type { Locale } from '@/i18n'
import { analyzeAudio, createProject, fetchProject, type Asset } from '@/lib/assetsApi'

// ============================================================================
// TYPES
// ============================================================================

type Step = 1 | 2 | 3

type SceneAction = 'regenerate' | 'edit' | 'animate' | 'expand' | 'favorite' | 'delete' | 'moveLeft' | 'moveRight'

type AudioFile = {
  file: File
  name: string
  size: string
  duration: number
  durationFmt: string
  url: string
}

type Segment = {
  id: string
  startTime: number
  endTime: number
  text: string
  type: 'lyrics' | 'instrumental' | 'silence'
}

type VisualStyle = 'cinematic' | 'anime' | 'cyberpunk' | 'watercolor' | 'minimal' | 'neon'
type AspectRatio = '9:16' | '16:9' | '1:1'

type StepWizardProps = {
  locale?: Locale
  onComplete?: (projectId: string, assets: Asset[]) => void
  onError?: (error: string) => void
}

type StoryboardScene = {
  sceneNumber: number
  timeCode: string
  lyrics: string
  prompt: string
  visualNotes: string
  animate?: boolean
  animateType?: 'zoom' | 'pan'
}

// ============================================================================
// COST TOOLTIP COMPONENT
// ============================================================================

function CostBadge({ 
  credits, 
  label, 
  breakdown 
}: { 
  credits: number
  label?: string
  breakdown?: { item: string; cost: number }[]
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  
  return (
    <div 
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'linear-gradient(135deg, rgba(180, 59, 255, 0.15), rgba(59, 130, 246, 0.15))',
        border: '1px solid rgba(180, 59, 255, 0.3)',
        borderRadius: 20,
        fontSize: 13,
        cursor: 'help',
        transition: 'all 0.2s'
      }}>
        <span style={{ fontSize: 14 }}>💎</span>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{credits}</span>
        {label && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</span>}
        <span style={{ 
          opacity: 0.5, 
          fontSize: 11,
          marginLeft: 2
        }}>ⓘ</span>
      </div>
      
      {showTooltip && breakdown && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          minWidth: 220,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 600 }}>
            DETALHAMENTO DE CUSTOS
          </div>
          {breakdown.map((item, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: i < breakdown.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 13
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{item.item}</span>
              <span style={{ fontWeight: 600 }}>{item.cost} 💎</span>
            </div>
          ))}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginTop: 12,
            paddingTop: 12,
            borderTop: '2px solid var(--accent)',
            fontWeight: 700
          }}>
            <span>Total</span>
            <span style={{ color: 'var(--accent)' }}>{credits} 💎</span>
          </div>
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: 12,
            height: 12,
            background: 'var(--panel)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)'
          }} />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// BALANCE DISPLAY
// ============================================================================

function BalanceDisplay({ balance }: { balance: number }) {
  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(10px)',
      border: '1px solid var(--border)',
      borderRadius: 24,
      fontSize: 14,
      fontWeight: 600,
      zIndex: 100
    }}>
      <span style={{ fontSize: 18 }}>💎</span>
      <span>{balance.toLocaleString()}</span>
      <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12 }}>créditos</span>
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const PLACEHOLDER_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

// ============================================================================
// SCENE CARD COMPONENT
// ============================================================================

type SceneCardProps = {
  asset: Asset
  index: number
  totalCount: number
  aspectRatio: AspectRatio
  timeCode?: string
  lyrics?: string
  isFavorite?: boolean
  isAnimated?: boolean
  onAction: (action: SceneAction, assetId: string) => void
}

function SceneCard({ 
  asset, 
  index, 
  totalCount,
  aspectRatio, 
  timeCode, 
  lyrics,
  isFavorite = false,
  isAnimated = false,
  onAction 
}: SceneCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Actions moved into the Scene modal / footer buttons (mobile-friendly)

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: isHovered 
          ? '0 12px 40px rgba(180, 59, 255, 0.2), 0 4px 12px rgba(0,0,0,0.3)' 
          : '0 2px 8px rgba(0,0,0,0.2)',
      }}
      onMouseEnter={() => { setIsHovered(true) }}
      onMouseLeave={() => { setIsHovered(false) }}
    >
      {/* Image Container */}
      <div style={{
        position: 'relative',
        aspectRatio: aspectRatio === '9:16' ? '9/16' : aspectRatio === '16:9' ? '16/9' : '1',
        overflow: 'hidden',
        cursor: 'pointer'
      }}
      onClick={() => onAction('expand', asset.id)}
      >
        <img
          src={asset.dataUrl || PLACEHOLDER_IMG}
          alt={`Cena ${index + 1}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.3s',
            transform: isHovered ? 'scale(1.05)' : 'scale(1)'
          }}
        />

        {/* Scene Number Badge */}
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          padding: '4px 10px',
          borderRadius: 8,
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <span style={{ color: 'var(--accent)' }}>{index + 1}</span>
          <span style={{ color: 'var(--text-muted)' }}>/{totalCount}</span>
        </div>

        {/* Favorite Badge */}
        {isFavorite && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(255, 193, 7, 0.9)',
            padding: '4px 8px',
            borderRadius: 8,
            fontSize: 12
          }}>
            ⭐
          </div>
        )}

        {/* Animated Badge */}
        {isAnimated && (
          <div style={{
            position: 'absolute',
            top: isFavorite ? 36 : 8,
            right: 8,
            background: 'linear-gradient(135deg, #b43bff, #3b82f6)',
            padding: '4px 8px',
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            ✨ Animado
          </div>
        )}

        {/* Gradient Overlay for info */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '32px 12px 12px',
          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          opacity: isHovered ? 0 : 1,
          transition: 'opacity 0.2s'
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
            {timeCode || `0:${(index * 5).toString().padStart(2, '0')}`}
          </div>
          {lyrics && lyrics !== '[instrumental]' && (
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {lyrics.slice(0, 35)}{lyrics.length > 35 ? '...' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Mobile-friendly footer: move + edit image (actions inside modal) */}
      <div style={{
        padding: 10,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <button
          className="btn-ghost"
          onClick={(e) => { e.stopPropagation(); onAction('moveLeft', asset.id) }}
          disabled={index === 0}
          title={index === 0 ? 'Primeira cena' : 'Mover para trás'}
          style={{
            padding: '10px 12px',
            fontSize: 14,
            minWidth: 52,
            opacity: index === 0 ? 0.4 : 1
          }}
        >
          ←
        </button>

        <button
          className="btn-ghost"
          onClick={(e) => { e.stopPropagation(); onAction('expand', asset.id) }}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8
          }}
        >
          ✏️ Editar imagem
        </button>

        <button
          className="btn-ghost"
          onClick={(e) => {
            e.stopPropagation()
            const key = (asset as any).fileKey || asset.id
            void copyText(key)
          }}
          title={(asset as any).fileKey || asset.id}
          style={{
            padding: '10px 10px',
            fontSize: 12,
            minWidth: 56,
            whiteSpace: 'nowrap'
          }}
        >
          🆔 Copiar
        </button>

        <button
          className="btn-ghost"
          onClick={(e) => { e.stopPropagation(); onAction('moveRight', asset.id) }}
          disabled={index === totalCount - 1}
          title={index === totalCount - 1 ? 'Última cena' : 'Mover para frente'}
          style={{
            padding: '10px 12px',
            fontSize: 14,
            minWidth: 52,
            opacity: index === totalCount - 1 ? 0.4 : 1
          }}
        >
          →
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// SCENE MODAL (Expand/Edit)
// ============================================================================

type SceneModalProps = {
  asset: Asset | null
  scene?: StoryboardScene | null
  mode: 'view' | 'edit'
  onClose: () => void
  onSetMode?: (mode: 'view' | 'edit') => void
  onSave?: (assetId: string, newPrompt: string) => void
  onRegenerate?: (assetId: string, newPrompt: string) => void
  onAction?: (action: SceneAction, assetId: string) => void
}

function SceneModal({ asset, scene, mode, onClose, onSetMode, onSave, onRegenerate, onAction }: SceneModalProps) {
  const [editPrompt, setEditPrompt] = useState(asset?.prompt || '')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (mode === 'edit' && textareaRef.current) {
      textareaRef.current.focus()
    }
    if (asset) {
      setEditPrompt(asset.prompt)
    }
  }, [asset, mode])

  if (!asset) return null

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    await onRegenerate?.(asset.id, editPrompt)
    setIsRegenerating(false)
  }

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.9)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: 'var(--panel)',
          borderRadius: 20,
          border: '1px solid var(--border)',
          maxWidth: mode === 'edit' ? 600 : 900,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)'
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {mode === 'edit' ? '✏️ Editar Prompt' : '🔍 Visualizar Cena'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px 8px',
              borderRadius: 8
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          padding: 20, 
          overflow: 'auto',
          display: 'flex',
          flexDirection: mode === 'edit' ? 'column' : 'row',
          gap: 20
        }}>
          {/* Image */}
          <div style={{ 
            flex: mode === 'edit' ? 'none' : 1,
            display: 'flex',
            justifyContent: 'center'
          }}>
            <img
              src={asset.dataUrl || PLACEHOLDER_IMG}
              alt="Scene"
              style={{
                maxWidth: '100%',
                maxHeight: mode === 'edit' ? 200 : '70vh',
                borderRadius: 12,
                border: '1px solid var(--border)'
              }}
            />
          </div>

          {/* Info/Edit Panel */}
          <div style={{ 
            flex: mode === 'edit' ? 'none' : '0 0 300px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            {mode === 'view' && (
              <>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>TIMECODE</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{scene?.timeCode || '-'}</div>
                </div>
                {scene?.lyrics && scene.lyrics !== '[instrumental]' && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>LETRA</div>
                    <div style={{ fontSize: 14, fontStyle: 'italic' }}>"{scene.lyrics}"</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>ID (FILEKEY)</div>
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: 10,
                    background: 'var(--bg)',
                    borderRadius: 8,
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1
                    }}>
                      {(asset as any).fileKey || asset.id}
                    </div>
                    <button
                      className="btn-ghost"
                      onClick={() => void copyText((asset as any).fileKey || asset.id)}
                      style={{ padding: '8px 10px', fontSize: 12 }}
                    >
                      Copiar
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>PROMPT</div>
                  <div style={{ 
                    fontSize: 13, 
                    lineHeight: 1.5,
                    padding: 12,
                    background: 'var(--bg)',
                    borderRadius: 8,
                    maxHeight: 150,
                    overflow: 'auto'
                  }}>
                    {asset.prompt}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  marginTop: 6
                }}>
                  <button
                    className="btn-ghost"
                    onClick={() => onSetMode?.('edit')}
                    style={{ padding: '10px 12px' }}
                  >
                    ✏️ Editar prompt
                  </button>

                  <button
                    className="btn-ghost"
                    onClick={() => void handleRegenerate()}
                    style={{ padding: '10px 12px' }}
                    title="Regenerar (30 💎)"
                  >
                    🔄 Regenerar
                  </button>

                  <button
                    className="btn-ghost"
                    onClick={() => onAction?.('favorite', asset.id)}
                    style={{ padding: '10px 12px' }}
                  >
                    ⭐ Favoritar
                  </button>

                  <div style={{
                    gridColumn: '1 / -1',
                    marginTop: 6,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)'
                  }}>
                    <div style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>ANIMAÇÃO (SIMPLES)</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {scene?.animate ? 'Ativada' : 'Desativada'}
                      </span>
                    </div>

                    <button
                      className={scene?.animate ? 'btn-primary' : 'btn-ghost'}
                      onClick={() => onAction?.('animate', asset.id)}
                      style={{ width: '100%', padding: '12px 12px', marginBottom: 10 }}
                    >
                      ✨ Animar simples
                    </button>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      opacity: scene?.animate ? 1 : 0.45,
                      pointerEvents: scene?.animate ? 'auto' : 'none'
                    }}>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" checked readOnly />
                        Zoom suave
                      </label>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <input type="checkbox" checked={false} readOnly />
                        Pan (em breve)
                      </label>
                    </div>

                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      Dica: ative a animação e gere o vídeo. (Em breve: escolher o tipo)
                    </div>
                  </div>

                  <button
                    className="btn-ghost"
                    onClick={() => { onClose(); onAction?.('delete', asset.id) }}
                    style={{ padding: '10px 12px', color: '#ef4444' }}
                  >
                    🗑️ Excluir
                  </button>
                </div>
              </>
            )}

            {mode === 'edit' && (
              <>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: 12, 
                    color: 'var(--text-muted)', 
                    marginBottom: 8 
                  }}>
                    DESCRIÇÃO DA CENA
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Descreva a cena que deseja gerar..."
                    style={{
                      width: '100%',
                      minHeight: 120,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: 14,
                      lineHeight: 1.5,
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: 12,
                  justifyContent: 'flex-end'
                }}>
                  <button
                    className="btn-ghost"
                    onClick={() => { onSave?.(asset.id, editPrompt); onClose() }}
                    style={{ padding: '10px 20px' }}
                  >
                    Salvar Prompt
                  </button>
                  <button
                    className="btn-primary"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    style={{ 
                      padding: '10px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {isRegenerating ? (
                      <>
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                        Gerando...
                      </>
                    ) : (
                      <>🔄 Regenerar (30 💎)</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function createSegmentsFromTranscription(text: string, duration: number): Segment[] {
  if (!text || text.trim().length === 0) {
    return [{ id: '1', startTime: 0, endTime: duration, text: '[Instrumental]', type: 'instrumental' }]
  }
  
  const sentences = text.split(/[.!?\n]+/).filter(s => s.trim().length > 0)
  const segmentDuration = duration / Math.max(sentences.length, 1)
  
  return sentences.map((s, i) => ({
    id: `seg-${i}`,
    startTime: i * segmentDuration,
    endTime: (i + 1) * segmentDuration,
    text: s.trim(),
    type: 'lyrics' as const
  }))
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StepWizard({ locale: _locale = 'pt', onComplete, onError }: StepWizardProps) {
  void _locale
  
  const [step, setStep] = useState<Step>(1)
  const [balance, setBalance] = useState(0)
  
  // Step 1
  const [audio, setAudio] = useState<AudioFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const projectCreateInFlight = useRef<Promise<any> | null>(null)
  const [projectName, setProjectName] = useState<string>(() => localStorage.getItem('tm_project_name') || '')
  const [segments, setSegments] = useState<Segment[]>([])
  const [hookText, setHookText] = useState('')
  const [isEditingHook, setIsEditingHook] = useState(false)
  const [mood, setMood] = useState('')
  const [genre, setGenre] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Audio Playback
  const togglePlay = () => {
    if (!audioRef.current && audio?.url) {
      audioRef.current = new Audio(audio.url)
      audioRef.current.onended = () => setIsPlaying(false)
    }
    
    if (isPlaying) {
      audioRef.current?.pause()
    } else {
      audioRef.current?.play()
    }
    setIsPlaying(!isPlaying)
  }

  // Cleanup audio on unmount or change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      // (poll removed)
    }
  }, [audio])
  
  // Step 2
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('cinematic')
  const [imgFrequency, setImgFrequency] = useState(3)
  const [desiredSceneCount, setDesiredSceneCount] = useState<number | null>(null)
  const [customTheme, setCustomTheme] = useState('')
  const [generating, setGenerating] = useState(false)
  const [storyboard, setStoryboard] = useState<StoryboardScene[]>([])
  
  // Step 3
  const [assets, setAssets] = useState<Asset[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderLog, setRenderLog] = useState<string>('')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  // Image generation controls
  // NOTE: We generate all images up-front (no preview/placeholders) to simplify UX.
  
  // Modal state
  const [modalAsset, setModalAsset] = useState<Asset | null>(null)
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('view')
  
  const [error, setError] = useState<string | null>(null)
  const token = localStorage.getItem('tm_auth_token') || ''

  const ensureProjectExists = async (nameHint?: string) => {
    if (!token) throw new Error('Faça login para continuar')
    if (projectId) return projectId
    if (projectCreateInFlight.current) {
      const r = await projectCreateInFlight.current
      return r.projectId as string
    }
    const name = (nameHint || projectName || 'Novo projeto').toString().trim()
    projectCreateInFlight.current = createProject(name, token)
    try {
      const created = await projectCreateInFlight.current
      setProjectId(created.projectId)
      setProjectName(name)
      localStorage.setItem('tm_project_name', name)
      localStorage.setItem('tm_project_id', created.projectId)
      localStorage.setItem('tm_ia_last_project_id', created.projectId)
      return created.projectId as string
    } finally {
      projectCreateInFlight.current = null
    }
  }

  // Resume last project ONLY when explicitly requested (e.g., user clicked a project card)
  useEffect(() => {
    if (!token || projectId) return
    const resumeFlag = localStorage.getItem('tm_resume_project')
    const stored = localStorage.getItem('tm_project_id')
    if (resumeFlag !== '1' || !stored) return

    // clear flag so a "new project" doesn't auto-load the previous one
    localStorage.removeItem('tm_resume_project')

    setProjectId(stored)
    fetchProject(stored, token)
      .then((resp) => {
        const proj = resp.project
        if (proj?.assets?.length) {
          setAssets(proj.assets)
          setStoryboard((proj.storyboard as any) || [])
          setStep(3)
        }
      })
      .catch(() => {})
  }, [token, projectId])

  // Fetch balance
  useEffect(() => {
    if (token) {
      fetch('/api/credits', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setBalance(d.balance || 0))
        .catch(() => {})
    }
  }, [token])

  // Cost calculations
  const autoImageCount = audio ? Math.ceil(audio.duration / imgFrequency) : Math.ceil(180 / imgFrequency)
  const imageCount = Math.max(3, Math.min(30, desiredSceneCount ?? autoImageCount))
  const transcriptionCost = audio ? Math.ceil(audio.duration / 60) * 3 : 3
  const analysisCost = 1
  const imageCost = imageCount * 30
  const renderCost = audio ? Math.ceil(audio.duration / 60) * 100 : 100

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // ==========================================================================
  // FILE UPLOAD & ANALYSIS HANDLER
  // ==========================================================================
  // CRITICAL: This handler MUST:
  // 1. Set audio state BEFORE upload (for UI feedback)
  // 2. Call uploadAudio() and wait for projectId/filePath
  // 3. Call analyzeAudio() with the returned filePath
  // 4. Set segments, hookText, mood, genre from analysis response
  // 5. Handle errors at each step separately
  //
  // The transcription WILL appear in Step 1 if:
  // - Upload succeeds (projectId returned)
  // - Analysis succeeds (transcription returned)
  // - segments/hookText states are set correctly
  //
  // DO NOT modify this flow without understanding the full chain!
  // ==========================================================================
  const handleFileSelect = async (file: File) => {
    if (!token) {
      setError('Faça login para continuar')
      return
    }

    // Ensure we have a projectId before doing anything else
    let ensuredProjectId = projectId
    if (!ensuredProjectId) {
      try {
        // IMPORTANT: do not overwrite the user-chosen project name with the audio filename.
        // Only use the filename as a fallback when the project name is empty.
        ensuredProjectId = await ensureProjectExists(projectName?.trim() ? undefined : file.name)
      } catch (err) {
        const message = (err as Error).message
        setError(message)
        onError?.(message)
        return
      }
    }
    
    // Reset all states for new upload
    setError(null)
    setSegments([])
    setHookText('')
    setMood('')
    setGenre('')
    setUploading(true)
    setAnalyzing(false)

    try {
      // Step 1: Get audio duration from browser
      const url = URL.createObjectURL(file)
      const audioEl = new Audio(url)
      
      const duration = await new Promise<number>((resolve) => {
        audioEl.onloadedmetadata = () => resolve(audioEl.duration)
        audioEl.onerror = () => resolve(180) // Fallback to 3 min
      })

      // Step 2: Set audio state for UI (shows file info)
      setAudio({
        file,
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        duration,
        durationFmt: formatTime(duration),
        url
      })

      // Step 3: Analyze audio (Upload + Analyze in one go)
      console.log('[StepWizard] Starting analysis (uploading)...')
      setAnalyzing(true)
      
      const analysis = await analyzeAudio(file, duration, token, ensuredProjectId || undefined)
      console.log('[StepWizard] Analysis complete:', analysis)
      
      setProjectId(analysis.projectId)
      localStorage.setItem('tm_project_id', analysis.projectId)
      
      // Step 4: Update state with analysis results
      const newSegments = createSegmentsFromTranscription(analysis.transcription || '', duration)
      console.log('[StepWizard] Created segments:', newSegments.length)
      
      setSegments(newSegments)
      setHookText(analysis.hookText || '')
      setMood(analysis.mood || 'energetic')
      setGenre(analysis.genre || 'pop')
      setBalance(analysis.balance || balance)
      setAnalyzing(false)
      
      console.log('[StepWizard] States updated - hookText:', analysis.hookText, 'segments:', newSegments.length)
      
    } catch (err) {
      const message = (err as Error).message
      console.error('[StepWizard] Error:', message)
      setError(message)
      onError?.(message)
      setUploading(false)
      setAnalyzing(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0])
  }

  const handleGenerateImages = async () => {
    if (!projectId || !token) return
    
    setGenerating(true)
    setError(null)
    
    try {
      const res = await fetch('/api/assets/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId,
          segments,
          style: visualStyle,
          mood,
          genre,
          aspectRatio,
          frequency: imgFrequency,
          imageCountOverride: desiredSceneCount ?? undefined,
          theme: customTheme.trim() || undefined,
          generationMode: 'full',
          modelId: 'gemini-2.5-flash-image',
          realCount: imageCount,
        })
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as any))
        const rid = err.requestId ? ` (id: ${err.requestId})` : ''
        throw new Error((err.error || 'Failed to generate') + rid)
      }
      
      const data = await res.json()
      setAssets(data.project?.assets || [])
      setStoryboard(data.storyboard || [])
      setBalance(data.balance || balance)
      setStep(3)
    } catch (err) {
      setError((err as Error).message)
      onError?.((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleAddScene = async () => {
    if (!projectId || !token || !audio) return
    setError(null)
    try {
      const res = await fetch('/api/assets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          projectId,
          segments,
          style: visualStyle,
          mood,
          genre,
          aspectRatio,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Falha ao adicionar cena')

      if (data.asset) setAssets((prev) => [...prev, data.asset])
      if (data.storyboardScene) setStoryboard((prev) => [...prev, data.storyboardScene])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleRender = async () => {
    if (!projectId || !token || assets.length === 0 || !audio) return
    
    setRendering(true)
    setRenderProgress(0)
    setRenderLog('')
    setError(null)
    
    try {
      const totalDuration = audio.duration
      
      const configData = {
        projectId,
        config: {
          format: aspectRatio === '9:16' ? 'vertical' : aspectRatio === '16:9' ? 'horizontal' : 'square',
          duration: totalDuration,
          scenesCount: assets.length,
          aspectRatio,
          quality: 'high'
        },
        renderOptions: {
          format: aspectRatio === '9:16' ? 'vertical' : aspectRatio === '16:9' ? 'horizontal' : 'square',
          quality: 'basic',
          watermark: false,
          crossfade: false,
          crossfadeDuration: 0.5
        }
      }

      // Send Audio + Config (Re-upload strategy for serverless persistence)
      const formData = new FormData()
      formData.append('audio', audio.file)
      formData.append('data', JSON.stringify(configData))

      const res = await fetch('/api/render/pro', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Render failed')
      }
      
      const data = await res.json()
      const jobId = data.renderId
      setBalance(data.balance || balance)
      
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/render/status?renderId=${jobId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          const status = await statusRes.json()
          
          setRenderProgress(status.progress || 0)
          if (status.logTail) setRenderLog(status.logTail)
          
          if (status.status === 'complete') {
            clearInterval(pollInterval)
            setVideoUrl(status.outputUrl || `/api/render/download?renderId=${jobId}`)
            setRendering(false)
          } else if (status.status === 'failed') {
            clearInterval(pollInterval)
            throw new Error(status.error || 'Render failed')
          }
        } catch (err) {
          clearInterval(pollInterval)
          setError((err as Error).message)
          setRendering(false)
        }
      }, 2000)
      
    } catch (err) {
      setError((err as Error).message)
      onError?.((err as Error).message)
      setRendering(false)
    }
  }

  const handleDownload = async () => {
    if (!videoUrl) return

    // If it's a direct URL (Blob), open/download without auth header.
    if (/^https?:\/\//i.test(videoUrl)) {
      window.open(videoUrl, '_blank')
      return
    }

    if (!token) return
    
    try {
      const res = await fetch(videoUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Download failed')
      }
      
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `video-${projectId}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const resetWizard = () => {
    setStep(1)
    setAudio(null)
    setAssets([])
    setVideoUrl(null)
    setSegments([])
    setHookText('')
    setStoryboard([])
    setFavorites(new Set())
    if (projectId && assets.length > 0) {
      onComplete?.(projectId, assets)
    }
  }

  // Scene action handlers
  const handleSceneAction = async (action: SceneAction, assetId: string) => {
    const assetIndex = assets.findIndex(a => a.id === assetId)
    if (assetIndex === -1) return

    switch (action) {
      case 'expand':
        setModalAsset(assets[assetIndex])
        setModalMode('view')
        break

      case 'edit':
        // "Editar imagem" opens the modal with actions; editing the prompt is inside.
        setModalAsset(assets[assetIndex])
        setModalMode('view')
        break

      case 'animate':
        // Toggle simple animation flag for this storyboard item
        setStoryboard((prev) => {
          const next = [...prev]
          const cur = next[assetIndex] as any
          next[assetIndex] = { ...cur, animate: !cur?.animate }
          void syncProjectEdits({ storyboard: buildStoryboardItems(next, assets) })
          return next
        })
        break

      case 'favorite':
        setFavorites(prev => {
          const next = new Set(prev)
          if (next.has(assetId)) {
            next.delete(assetId)
          } else {
            next.add(assetId)
          }
          return next
        })
        break

      case 'delete':
        if (assets.length <= 1) {
          setError('Você precisa de pelo menos 1 cena')
          return
        }
        setAssets(prev => {
          const nextAssets = prev.filter(a => a.id !== assetId)
          return nextAssets
        })
        setStoryboard(prev => {
          const nextStoryboard = prev.filter((_, i) => i !== assetIndex)
          // persist BOTH asset order + storyboard so render never points to a deleted asset
          const nextAssets = assets.filter(a => a.id !== assetId)
          void syncProjectEdits({
            deletedAssetIds: [assetId],
            assetOrder: nextAssets.map(a => a.id),
            storyboard: buildStoryboardItems(nextStoryboard, nextAssets),
          })
          return nextStoryboard
        })
        break

      case 'moveLeft':
        if (assetIndex > 0) {
          setAssets(prev => {
            const next = [...prev]
            ;[next[assetIndex - 1], next[assetIndex]] = [next[assetIndex], next[assetIndex - 1]]
            // keep storyboard order in DB consistent with assets order
            void syncProjectEdits({
              assetOrder: next.map(a => a.id),
              storyboard: buildStoryboardItems(storyboard, next),
            })
            return next
          })
          setStoryboard(prev => {
            const next = [...prev]
            ;[next[assetIndex - 1], next[assetIndex]] = [next[assetIndex], next[assetIndex - 1]]
            return next
          })
        }
        break

      case 'moveRight':
        if (assetIndex < assets.length - 1) {
          setAssets(prev => {
            const next = [...prev]
            ;[next[assetIndex], next[assetIndex + 1]] = [next[assetIndex + 1], next[assetIndex]]
            // keep storyboard order in DB consistent with assets order
            void syncProjectEdits({
              assetOrder: next.map(a => a.id),
              storyboard: buildStoryboardItems(storyboard, next),
            })
            return next
          })
          setStoryboard(prev => {
            const next = [...prev]
            ;[next[assetIndex], next[assetIndex + 1]] = [next[assetIndex + 1], next[assetIndex]]
            return next
          })
        }
        break

      case 'regenerate':
        await handleRegenerateAsset(assetId, assets[assetIndex].prompt)
        break

      // (animate case handled earlier)
    }
  }

  const handleRegenerateAsset = async (assetId: string, prompt: string) => {
    if (!projectId || !token) return

    try {
      const res = await fetch('/api/assets/regen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ projectId, assetId, prompt })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Regeneração falhou')
      }

      const data = await res.json()

      // Update the asset in state
      setAssets(prev => prev.map(a =>
        a.id === assetId ? data.asset : a
      ))
      setBalance(data.balance || balance)
      setModalAsset(null)

    } catch (err) {
      setError((err as Error).message)
      onError?.((err as Error).message)
    }
  }

  // Removed: generate-selected (preview/placeholders flow). We now generate all images up-front.

  const buildStoryboardItems = (scenes: StoryboardScene[], assetsList: Asset[]) => {
    // DB/render expects [{ assetId, durationSec, animate }]
    return assetsList.map((a, i) => ({
      assetId: a.id,
      durationSec: (a as any).durationSec || 5,
      animate: !!(scenes[i] as any)?.animate,
    }))
  }

  const syncProjectEdits = async (opts: { storyboard?: any[]; assetsPatch?: Array<{ id: string; prompt: string }>; deletedAssetIds?: string[]; assetOrder?: string[] }) => {
    if (!projectId || !token) return
    try {
      await fetch('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, ...opts }),
      })
    } catch {
      // best-effort; UI state is source of truth for now
    }
  }

  const handleSavePrompt = (assetId: string, newPrompt: string) => {
    setAssets(prev => prev.map(a => 
      a.id === assetId ? { ...a, prompt: newPrompt } : a
    ))
    void syncProjectEdits({ assetsPatch: [{ id: assetId, prompt: newPrompt }] })
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const stepLabels = ['Upload & Análise', 'Roteiro Visual', 'Gerar Vídeo']

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px', position: 'relative' }}>
      
      <BalanceDisplay balance={balance} />
      
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ 
          fontSize: 32, 
          fontWeight: 800, 
          marginBottom: 8,
          background: 'linear-gradient(135deg, #b43bff, #3b82f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Criar Vídeo Musical
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          IA transforma sua música em experiência visual
        </p>
      </header>

      {/* Steps */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 32 }}>
        {[1, 2, 3].map((s) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: s === step ? 'var(--accent)' : s < step ? 'var(--success)' : 'var(--panel)',
              borderRadius: 20,
              transition: 'all 0.3s'
            }}>
              <span style={{ 
                fontWeight: 700, 
                fontSize: 14,
                color: s <= step ? '#000' : 'var(--text-muted)'
              }}>
                {s < step ? '✓' : s}
              </span>
              <span style={{ 
                fontSize: 13,
                color: s <= step ? '#000' : 'var(--text-muted)',
                fontWeight: s === step ? 600 : 400
              }}>
                {stepLabels[s - 1]}
              </span>
            </div>
            {s < 3 && (
              <div style={{ 
                width: 24, 
                height: 2, 
                background: s < step ? 'var(--success)' : 'var(--border)',
                transition: 'all 0.3s'
              }} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ 
          background: 'rgba(255, 77, 109, 0.1)', 
          border: '1px solid var(--danger)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: 'var(--danger)' }}>{error}</span>
          <button 
            onClick={() => setError(null)} 
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 18 }}
          >
            ×
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 1: UPLOAD & ANÁLISE */}
      {/* ================================================================== */}
      {step === 1 && (
        <div className="card" style={{ padding: 24 }}>

          {/* Project Name */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
              NOME DO PROJETO
            </div>
            <input
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value)
                localStorage.setItem('tm_project_name', e.target.value)
              }}
              placeholder="Ex: Clipe - Minha Música"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 14,
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Esse nome será usado para criar o projeto antes do upload.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={async () => {
                  try {
                    await ensureProjectExists()
                    setError(null)
                  } catch (err) {
                    const message = (err as Error).message
                    setError(message)
                    onError?.(message)
                  }
                }}
                disabled={!token || !projectName.trim() || !!projectId}
                title={projectId ? 'Projeto já criado' : 'Criar projeto agora'}
              >
                {projectId ? 'Projeto criado ✓' : 'Salvar projeto'}
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  try {
                    await ensureProjectExists()
                    setError(null)
                  } catch (err) {
                    const message = (err as Error).message
                    setError(message)
                    onError?.(message)
                  }
                }}
                disabled={!token || !projectName.trim()}
              >
                Continuar →
              </button>
            </div>
          </div>
          
          {!audio ? (
            <>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: dragActive ? '2px dashed var(--accent)' : '2px dashed var(--border)',
                  borderRadius: 16,
                  padding: 48,
                  textAlign: 'center',
                  background: dragActive ? 'rgba(180, 59, 255, 0.05)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {uploading ? (
                  <div>
                    <div className="spinner" style={{ margin: '0 auto 16px' }} />
                    <p>Enviando áudio...</p>
                  </div>
                ) : (
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <input 
                      type="file" 
                      accept="audio/*" 
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                      style={{ display: 'none' }}
                    />
                    <div style={{ fontSize: 56, marginBottom: 16 }}>🎵</div>
                    <p style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Arraste seu áudio aqui</p>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>ou clique para selecionar</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>MP3, WAV, FLAC • Máximo 15MB</p>
                  </label>
                )}
              </div>
              
              <div style={{ 
                marginTop: 20, 
                padding: 16, 
                background: 'var(--panel)', 
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ color: 'var(--text-muted)' }}>Custo da análise:</span>
                <CostBadge 
                  credits={transcriptionCost + analysisCost} 
                  breakdown={[
                    { item: 'Transcrição (IA)', cost: transcriptionCost },
                    { item: 'Análise de hook', cost: analysisCost }
                  ]}
                />
              </div>
            </>
          ) : (
            <div>
              {/* Audio info */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 16, 
                padding: 20, 
                background: 'linear-gradient(135deg, rgba(180, 59, 255, 0.1), rgba(59, 130, 246, 0.1))', 
                borderRadius: 16, 
                marginBottom: 24,
                border: '1px solid rgba(180, 59, 255, 0.2)'
              }}>
                <div style={{ 
                  width: 56, 
                  height: 56, 
                  borderRadius: 12,
                  background: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24
                }}>🎵</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{audio.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    {audio.durationFmt} • {audio.size}
                  </div>
                </div>
                <button
                  className="btn-ghost"
                  onClick={togglePlay}
                  style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isPlaying ? '⏸' : '▶'} {isPlaying ? 'Pausar' : 'Ouvir'}
                </button>
                <button 
                  className="btn-ghost" 
                  onClick={() => { 
                    setAudio(null); 
                    setSegments([]); 
                    setHookText('');
                    if(isPlaying) togglePlay(); 
                  }}
                  style={{ fontSize: 13 }}
                >
                  Trocar
                </button>
              </div>

              {/* ============================================================ */}
              {/* ANALYSIS SECTION */}
              {/* ============================================================ */}
              {/* IMPORTANT: This section shows transcription results. */}
              {/* It displays when: */}
              {/*   - analyzing=false (analysis complete) */}
              {/*   - hookText or segments have data */}
              {/* If no data appears, check console for [StepWizard] logs */}
              {/* ============================================================ */}
              {analyzing ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div className="spinner" style={{ margin: '0 auto 16px' }} />
                  <p style={{ fontWeight: 600 }}>Analisando sua música...</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                    Transcrevendo letras e detectando hooks
                  </p>
                </div>
              ) : (
                <>
                  {/* Analysis complete indicator */}
                  {!analyzing && audio && projectId && !hookText && segments.length === 0 && (
                    <div style={{ 
                      padding: 20, 
                      background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1), rgba(251, 191, 36, 0.1))', 
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      borderRadius: 16, 
                      marginBottom: 20,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🎼</div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Música Instrumental Detectada</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Nenhuma letra encontrada. Você ainda pode criar seu vídeo!
                      </div>
                    </div>
                  )}
                  
                  {/* Hook detected */}
                  {hookText && (
                    <div style={{ 
                      padding: 20, 
                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.1))', 
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: 16, 
                      marginBottom: 20 
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        marginBottom: 8 
                      }}>
                        <div style={{
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 8, 
                          fontSize: 12, 
                          color: 'var(--success)', 
                          fontWeight: 600
                        }}>
                          <span>🎯</span> REFRÃO (HOOK)
                        </div>
                        <button
                          className="btn-ghost"
                          onClick={() => setIsEditingHook(!isEditingHook)}
                          style={{ fontSize: 11, padding: '2px 8px', height: 'auto' }}
                        >
                          {isEditingHook ? 'Cancelar' : 'Editar'}
                        </button>
                      </div>

                      {isEditingHook ? (
                         <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                           <textarea
                             value={hookText}
                             onChange={(e) => setHookText(e.target.value)}
                             style={{
                               width: '100%',
                               padding: 10,
                               borderRadius: 8,
                               border: '1px solid var(--border)',
                               background: 'rgba(0,0,0,0.2)',
                               color: 'var(--text)',
                               fontSize: 16,
                               fontStyle: 'italic',
                               minHeight: 80
                             }}
                           />
                           <button 
                             className="btn-primary" 
                             style={{ alignSelf: 'flex-end', padding: '6px 12px', fontSize: 12 }}
                             onClick={() => setIsEditingHook(false)}
                           >
                             Salvar
                           </button>
                         </div>
                      ) : (
                        <div style={{ fontSize: 18, fontWeight: 600, fontStyle: 'italic' }}>
                          "{hookText}"
                        </div>
                      )}

                      <div style={{ 
                        display: 'flex', 
                        gap: 16, 
                        marginTop: 12,
                        fontSize: 13
                      }}>
                        {mood && (
                          <span style={{ 
                            padding: '4px 12px', 
                            background: 'rgba(180, 59, 255, 0.2)', 
                            borderRadius: 12 
                          }}>
                            Mood: {mood}
                          </span>
                        )}
                        {genre && (
                          <span style={{ 
                            padding: '4px 12px', 
                            background: 'rgba(59, 130, 246, 0.2)', 
                            borderRadius: 12 
                          }}>
                            Gênero: {genre}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Segments preview */}
                  {segments.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ 
                        fontSize: 12, 
                        color: 'var(--text-muted)', 
                        marginBottom: 12,
                        fontWeight: 600 
                      }}>
                        TRANSCRIÇÃO ({segments.length} segmentos)
                      </div>
                      <div style={{ 
                        maxHeight: 200, 
                        overflow: 'auto', 
                        background: 'var(--panel)', 
                        borderRadius: 12,
                        padding: 4
                      }}>
                        {segments.slice(0, 6).map((seg, i) => (
                          <div key={seg.id} style={{
                            display: 'flex',
                            gap: 12,
                            padding: '10px 12px',
                            borderBottom: i < 5 ? '1px solid var(--border)' : 'none'
                          }}>
                            <span style={{ 
                              color: 'var(--accent)', 
                              fontFamily: 'monospace',
                              fontSize: 12,
                              minWidth: 50
                            }}>
                              {formatTime(seg.startTime)}
                            </span>
                            <span style={{ 
                              fontSize: 14,
                              color: seg.type === 'instrumental' ? 'var(--text-muted)' : 'var(--text)',
                              fontStyle: seg.type === 'instrumental' ? 'italic' : 'normal'
                            }}>
                              {seg.text}
                            </span>
                          </div>
                        ))}
                        {segments.length > 6 && (
                          <div style={{ 
                            padding: '10px 12px', 
                            color: 'var(--text-muted)',
                            fontSize: 13,
                            textAlign: 'center'
                          }}>
                            +{segments.length - 6} mais segmentos
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button 
                    className="btn-primary" 
                    style={{ width: '100%', padding: 16, fontSize: 16 }}
                    onClick={() => setStep(2)}
                  >
                    Criar Roteiro Visual →
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 2: ROTEIRO VISUAL */}
      {/* ================================================================== */}
      {step === 2 && (
        <div className="card" style={{ padding: 24 }}>
          
          {/* Format */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: 12 
            }}>
              <span style={{ fontWeight: 600 }}>Formato do Vídeo</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {([
                ['9:16', '📱', 'Vertical', 'TikTok, Reels'],
                ['16:9', '🖥️', 'Horizontal', 'YouTube'],
                ['1:1', '⬜', 'Quadrado', 'Instagram']
              ] as const).map(([ratio, icon, name, platforms]) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  style={{
                    padding: 16,
                    border: aspectRatio === ratio ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 12,
                    background: aspectRatio === ratio ? 'rgba(180, 59, 255, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{platforms}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}>
              Estilo Visual
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {([
                ['cinematic', '🎬', 'Cinemático'],
                ['anime', '🎌', 'Anime'],
                ['cyberpunk', '🌃', 'Cyberpunk'],
                ['watercolor', '🎨', 'Aquarela'],
                ['minimal', '◽', 'Minimal'],
                ['neon', '💜', 'Neon']
              ] as const).map(([style, icon, name]) => (
                <button
                  key={style}
                  onClick={() => setVisualStyle(style)}
                  style={{
                    padding: 12,
                    border: visualStyle === style ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 10,
                    background: visualStyle === style ? 'rgba(180, 59, 255, 0.1)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{icon}</span>
                  <span style={{ fontWeight: visualStyle === style ? 600 : 400 }}>{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom options */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}>
              Opções personalizadas
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                  QUANTIDADE DE CENAS (3 a 30)
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={desiredSceneCount ?? ''}
                    onChange={(e) => {
                      const v = e.target.value
                      if (!v) {
                        setDesiredSceneCount(null)
                        return
                      }
                      const n = Math.max(3, Math.min(30, parseInt(v)))
                      setDesiredSceneCount(Number.isFinite(n) ? n : null)
                    }}
                    placeholder="Auto"
                    style={{
                      width: 140,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                    }}
                  />
                  <button
                    className="btn-ghost"
                    onClick={() => setDesiredSceneCount(null)}
                    title="Voltar para automático"
                  >
                    Auto
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {desiredSceneCount ? 'Frequência desativada' : 'Calculado pela frequência'}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                  TEMA (opcional)
                </div>
                <textarea
                  value={customTheme}
                  onChange={(e) => setCustomTheme(e.target.value)}
                  placeholder="Ex: espaço, astronauta solitário, neon, vibe melancólica..."
                  style={{
                    width: '100%',
                    minHeight: 80,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    fontSize: 14,
                    lineHeight: 1.4,
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Frequency */}
          <div style={{ marginBottom: 28, opacity: desiredSceneCount ? 0.45 : 1, pointerEvents: desiredSceneCount ? 'none' : 'auto' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 12 }}>
              Ritmo Visual
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { freq: 2, label: 'Intenso' },
                { freq: 3, label: 'Dinâmico', rec: true },
                { freq: 5, label: 'Suave' },
                { freq: 8, label: 'Lento' }
              ].map(({ freq, label, rec }) => {
                const count = audio ? Math.max(3, Math.min(30, Math.ceil(audio.duration / freq))) : Math.ceil(180 / freq)
                return (
                  <button
                    key={freq}
                    onClick={() => setImgFrequency(freq)}
                    style={{
                      padding: 12,
                      border: imgFrequency === freq ? '2px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 10,
                      background: imgFrequency === freq ? 'rgba(180, 59, 255, 0.1)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'center',
                      position: 'relative',
                      transition: 'all 0.2s'
                    }}
                  >
                    {rec && (
                      <span style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        background: 'var(--accent)',
                        color: '#000',
                        fontSize: 9,
                        padding: '2px 6px',
                        borderRadius: 8,
                        fontWeight: 700
                      }}>
                        ★
                      </span>
                    )}
                    <div style={{ fontWeight: 600 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count} cenas</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cost summary */}
          <div style={{ 
            padding: 20, 
            background: 'var(--panel)', 
            borderRadius: 16, 
            marginBottom: 24
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 16
            }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Roteiro: {imageCount} cenas</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  IA vai criar prompts únicos baseados na letra
                </div>
              </div>
              <CostBadge 
                credits={imageCost}
                breakdown={[
                  { item: `${imageCount} imagens × 30`, cost: imageCost }
                ]}
              />
            </div>
            
            {balance < imageCost && (
              <div style={{
                padding: 12,
                background: 'rgba(255, 77, 109, 0.1)',
                border: '1px solid var(--danger)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--danger)'
              }}>
                ⚠️ Saldo insuficiente. Você tem {balance} 💎, precisa de {imageCost} 💎
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>
              ← Voltar
            </button>
            <button 
              className="btn-primary" 
              style={{ flex: 2 }}
              onClick={handleGenerateImages}
              disabled={generating || balance < imageCost}
            >
              {generating ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} />
                  Criando roteiro...
                </>
              ) : (
                `Gerar ${imageCount} Cenas`
              )}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* STEP 3: GERAR VÍDEO */}
      {/* ================================================================== */}
      {step === 3 && (
        <div>
          
          {/* Header with music info + controls */}
          <div style={{
            marginBottom: 20,
            padding: '16px 20px',
            background: 'var(--panel)',
            borderRadius: 16,
            border: '1px solid var(--border)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              <div style={{ minWidth: 220 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                  Edição do clipe
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  {audio?.name || 'Áudio'} • {audio?.durationFmt || '3:00'} • {assets.length} cenas
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className={isPlaying ? 'btn-primary' : 'btn-ghost'}
                  onClick={togglePlay}
                  style={{ padding: '10px 14px', borderRadius: 12 }}
                  title={isPlaying ? 'Pausar' : 'Tocar'}
                >
                  {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>

                <button
                  className="btn-ghost"
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.pause()
                      audioRef.current.currentTime = 0
                    }
                    setIsPlaying(false)
                  }}
                  style={{ padding: '10px 14px', borderRadius: 12 }}
                  title="Parar"
                >
                  ⏹️ Stop
                </button>

                {favorites.size > 0 && (
                  <span style={{
                    padding: '6px 12px',
                    background: 'rgba(255, 193, 7, 0.15)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    ⭐ {favorites.size} favoritos
                  </span>
                )}

                <span style={{
                  padding: '6px 12px',
                  background: 'rgba(180, 59, 255, 0.1)',
                  border: '1px solid rgba(180, 59, 255, 0.3)',
                  borderRadius: 20,
                  fontSize: 12
                }}>
                  {aspectRatio} • {visualStyle}
                </span>
              </div>
            </div>

            {/* Full generation: no preview/placeholders */}
          </div>

          {/* Action hints */}
          <div style={{
            display: 'flex',
            gap: 16,
            marginBottom: 20,
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(180, 59, 255, 0.05), rgba(59, 130, 246, 0.05))',
            borderRadius: 12,
            fontSize: 12,
            color: 'var(--text-muted)',
            flexWrap: 'wrap'
          }}>
            <span>💡 <strong>Dica:</strong> Passe o mouse nas cenas para ver as ações</span>
            <span>• <strong>←→</strong> Reordenar</span>
            <span>• <strong>🔄</strong> Regenerar (30💎)</span>
            <span>• <strong>✏️</strong> Editar prompt</span>
          </div>
          
          {/* Scene Cards Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: aspectRatio === '9:16' 
              ? 'repeat(auto-fill, minmax(140px, 1fr))' 
              : aspectRatio === '16:9'
                ? 'repeat(auto-fill, minmax(220px, 1fr))'
                : 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 16,
            marginBottom: 24
          }}>
            {assets.map((asset, i) => {
              const scene = storyboard[i]
              return (
                <div key={asset.id} style={{ position: 'relative' }}>
                  {/* Full generation: removed per-scene selection */}

                  <SceneCard
                    asset={asset}
                    index={i}
                    totalCount={assets.length}
                    aspectRatio={aspectRatio}
                    timeCode={scene?.timeCode}
                    lyrics={scene?.lyrics}
                    isFavorite={favorites.has(asset.id)}
                    isAnimated={false}
                    onAction={handleSceneAction}
                  />
                </div>
              )
            })}

            {/* Add new scene */}
            <button
              className="btn-ghost"
              onClick={handleAddScene}
              style={{
                minHeight: aspectRatio === '16:9' ? 140 : 220,
                border: '2px dashed var(--border)',
                borderRadius: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
            >
              <div style={{ fontSize: 28, color: 'var(--accent)' }}>＋</div>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>Adicionar cena</div>
              <div style={{ fontSize: 12 }}>A IA cria o prompt e gera a imagem</div>
            </button>
          </div>

          {/* Render section */}
          <div className="card" style={{ padding: 24 }}>
            {!videoUrl ? (
              <>
                <div style={{ 
                  padding: 20, 
                  background: 'linear-gradient(135deg, rgba(180, 59, 255, 0.08), rgba(59, 130, 246, 0.08))',
                  border: '1px solid rgba(180, 59, 255, 0.2)',
                  borderRadius: 16, 
                  marginBottom: 24
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 16 }}>
                        🎬 Renderização Final
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {audio?.durationFmt || '3:00'} de vídeo • {assets.length} cenas • Crossfade suave
                      </div>
                    </div>
                    <CostBadge 
                      credits={renderCost}
                      breakdown={[
                        { item: `Render (${Math.ceil((audio?.duration || 180) / 60)} min)`, cost: renderCost }
                      ]}
                    />
                  </div>
                </div>

                {/* Progress */}
                {rendering && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginBottom: 8,
                      fontSize: 14
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                        Renderizando vídeo...
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{renderProgress}%</span>
                    </div>
                    <div style={{ 
                      height: 10, 
                      background: 'var(--panel)', 
                      borderRadius: 5, 
                      overflow: 'hidden' 
                    }}>
                      <div style={{ 
                        width: `${renderProgress}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, var(--accent), #3b82f6)',
                        transition: 'width 0.3s ease',
                        borderRadius: 5
                      }} />
                    </div>
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      textAlign: 'center'
                    }}>
                      Isso pode levar alguns minutos...
                    </div>

                    {renderLog && (
                      <div style={{
                        marginTop: 12,
                        padding: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        background: 'var(--panel)'
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-muted)' }}>
                          LOGS (FFmpeg)
                        </div>
                        <pre style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: 11,
                          maxHeight: 160,
                          overflow: 'auto',
                          color: 'var(--text-muted)'
                        }}>
                          {renderLog}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    className="btn-ghost" 
                    style={{ flex: 1 }} 
                    onClick={() => setStep(2)} 
                    disabled={rendering}
                  >
                    ← Voltar
                  </button>
                  <button 
                    className="btn-primary" 
                    style={{ 
                      flex: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                    onClick={handleRender}
                    disabled={rendering || balance < renderCost}
                  >
                    {rendering ? (
                      <>Renderizando {renderProgress}%...</>
                    ) : (
                      <>🎬 Gerar Vídeo Final</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Success */}
                <div style={{ 
                  padding: 40, 
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.1))', 
                  border: '1px solid var(--success)',
                  borderRadius: 16, 
                  textAlign: 'center',
                  marginBottom: 24
                }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                  <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Vídeo Pronto!</div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 15 }}>
                    Seu clipe musical foi gerado com sucesso
                  </div>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button 
                      className="btn-primary" 
                      onClick={handleDownload}
                      style={{ 
                        padding: '16px 32px', 
                        fontSize: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      ⬇️ Baixar Vídeo MP4
                    </button>
                    <button 
                      className="btn-ghost" 
                      onClick={() => window.open(videoUrl, '_blank')}
                      style={{ padding: '16px 24px' }}
                    >
                      ▶️ Assistir
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button 
                    className="btn-ghost" 
                    style={{ flex: 1 }}
                    onClick={() => { setVideoUrl(null); setRenderProgress(0) }}
                  >
                    ✏️ Editar Cenas
                  </button>
                  <button 
                    className="btn-ghost" 
                    style={{ flex: 1 }}
                    onClick={resetWizard}
                  >
                    ➕ Criar Novo Vídeo
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Scene Modal */}
          {modalAsset && (
            <SceneModal
              asset={modalAsset}
              scene={storyboard[assets.findIndex(a => a.id === modalAsset.id)]}
              mode={modalMode}
              onClose={() => { setModalAsset(null); setModalMode('view') }}
              onSetMode={setModalMode}
              onSave={handleSavePrompt}
              onRegenerate={handleRegenerateAsset}
              onAction={handleSceneAction}
            />
          )}
        </div>
      )}
      
      {/* Global styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
