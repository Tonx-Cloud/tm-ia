import { useState } from 'react'
import { t } from '@/i18n'
import { analyzeAudio, generateAssets, type Asset } from '@/lib/assetsApi'

// --- Types ---
type AudioFile = {
  name: string
  size: string
  duration: string
  format: string
  url: string
}

type Segment = {
  id: string
  startTime: number
  endTime: number
  text: string
  type: 'speech' | 'music' | 'silence'
}

// --- Helper to fake segments from raw text (until backend supports timestamps) ---
function createSegmentsFromText(text: string, duration: number): Segment[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const segmentDuration = duration / (sentences.length || 1)
  
  return sentences.map((s, i) => ({
    id: `seg-${i}`,
    startTime: Math.floor(i * segmentDuration),
    endTime: Math.floor((i + 1) * segmentDuration),
    text: s.trim(),
    type: 'speech'
  }))
}

// --- Components ---

const SectionTitle = ({ number, title }: { number: string, title: string }) => (
// ... (SectionTitle component remains same)
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
    <div style={{ 
      background: 'var(--accent)', 
      color: '#000', 
      width: 24, 
      height: 24, 
      borderRadius: '50%', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontWeight: 'bold',
      fontSize: 12
    }}>
      {number}
    </div>
    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
  </div>
)

type Props = {
  onProjectReady?: (projectId: string, assets: Asset[]) => void
}

export function Dashboard({ onProjectReady }: Props = {}) {
  // State
  const [file, setFile] = useState<AudioFile | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [dragActive, setDragActive] = useState(false)
  const [imgFrequency, setImgFrequency] = useState(3)
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16')
  const [visualStyle, setVisualStyle] = useState('cinematic')

  // Auth token (simple retrieval)
  const token = localStorage.getItem('tm_auth_token') || ''

  // Process File (Upload + Analyze)
  const processFile = async (fileObj: File) => {
    if (!token) {
      setError('Please log in first')
      return
    }
    setError(null)
    setUploading(true)

    try {
      // 1. Local Preview & Duration
      const url = URL.createObjectURL(fileObj)
      const audio = new Audio(url)
      
      const duration = await new Promise<number>((resolve) => {
        audio.onloadedmetadata = () => resolve(audio.duration)
        audio.onerror = () => resolve(30) // Fallback
      })

      const durationFmt = `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`
      
      setFile({
        name: fileObj.name,
        size: (fileObj.size / (1024 * 1024)).toFixed(2) + ' MB',
        duration: durationFmt,
        format: fileObj.type.split('/')[1] || 'audio',
        url
      })

      // 2. Upload & Analyze (Combined)
      // Removed standalone upload step as it's now integrated
      // const uploadResp = await uploadAudio(fileObj, token)
      // setProjectId(uploadResp.projectId)
      setUploading(false)

      // 3. Analyze
      setAnalyzing(true)
      const analysis = await analyzeAudio(fileObj, duration, token)
      setProjectId(analysis.projectId)
      
      // Update UI with real data
      if (analysis.transcription) {
        setSegments(createSegmentsFromText(analysis.transcription, duration))
      } else {
        setSegments([{ id: '1', startTime: 0, endTime: duration, text: '(Instrumental / No speech detected)', type: 'music' }])
      }
      
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      setAnalyzing(false)
    }
  }

  const handleGenerate = async () => {
    if (!projectId || !token) return
    setGenerating(true)
    setError(null)
    try {
      // Calculate count based on frequency (min 4, max 24 as per API)
      const durationSec = file ? parseInt(file.duration.split(':')[0]) * 60 + parseInt(file.duration.split(':')[1]) : 30
      const count = Math.max(4, Math.min(24, Math.ceil(durationSec / imgFrequency)))
      
      // Construct prompt from style + context
      const prompt = `Style: ${visualStyle}. Context: ${segments.map(s => s.text).join(' ').slice(0, 500)}`
      
      const result = await generateAssets(prompt, count, token)
      
      // Navigate to editor with generated assets
      if (onProjectReady && result.project) {
        onProjectReady(projectId, result.project.assets)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  // File Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       processFile(e.target.files[0])
    }
  }

  return (
    <div style={{ maxWidth: 768, margin: '0 auto', padding: '40px 20px' }}>
      
      {/* Header */}
      <header style={{ marginBottom: 40, textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {t('cta.create_video')}
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>Transform audio into visual storytelling in seconds.</p>
        {error && <div style={{ color: 'var(--danger)', marginTop: 12, background: 'rgba(255, 77, 109, 0.1)', padding: 8, borderRadius: 8 }}>{error}</div>}
      </header>

      {/* 1. AUDIO UPLOAD */}
      <section className="card" style={{ 
        padding: file ? 20 : 40, 
        border: dragActive ? '2px dashed var(--accent)' : '2px dashed var(--border)',
        background: dragActive ? 'rgba(180, 59, 255, 0.05)' : 'var(--panel)',
        transition: 'all 0.2s',
        cursor: file ? 'default' : 'pointer',
        marginBottom: 32,
        position: 'relative'
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      >
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit', zIndex: 10 }}>
            <div style={{ color: 'white', fontWeight: 600 }}>Uploading...</div>
          </div>
        )}

        {!file ? (
          <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <input type="file" accept="audio/*" onChange={handleFileInput} style={{ display: 'none' }} />
            <div style={{ 
              width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border)' 
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Upload Audio File</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Drag & drop or click to browse (MP3, WAV)</div>
            </div>
          </label>
        ) : (
          // 2. AUDIO METADATA (Replaces upload visual)
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ 
                  width: 48, height: 48, borderRadius: 12, background: 'var(--accent-gradient)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 'bold' 
                }}>
                  ♫
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{file.name}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>{file.format.toUpperCase()}</span>
                    <span>•</span>
                    <span>{file.duration}</span>
                    <span>•</span>
                    <span>{file.size}</span>
                  </div>
                </div>
              </div>
              <button 
              onClick={() => { setFile(null); setSegments([]); setProjectId(null); }}
              className="btn-ghost"
              style={{ fontSize: 13, padding: '8px 12px' }}
              disabled={uploading || analyzing}
              >
                Change File
              </button>
          </div>
        )}
      </section>

      {/* POST-UPLOAD FLOW */}
      {file && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, animation: 'fadeIn 0.5s ease-out' }}>
          
          {/* 3. TRANSCRIPTION */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <SectionTitle number="2" title="Transcription" />
               {analyzing && <span style={{ fontSize: 12, color: 'var(--accent)' }}>Analyzing audio...</span>}
            </div>
            
            <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 100 }}>
              {segments.length > 0 ? segments.map((seg) => (
                <div key={seg.id} style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '60px 1fr', 
                  borderBottom: '1px solid var(--border)',
                  background: 'transparent'
                }}>
                  <div style={{ 
                    padding: 16, 
                    color: 'var(--text-muted)', 
                    fontSize: 12, 
                    fontFamily: 'monospace',
                    borderRight: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {seg.startTime}s
                  </div>
                  <div style={{ padding: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    {seg.type === 'music' && <span style={{ padding: '2px 8px', borderRadius: 4, background: '#22d3ee', color: '#000', fontSize: 10, fontWeight: 'bold' }}>MUSIC</span>}
                    {seg.type === 'silence' && <span style={{ padding: '2px 8px', borderRadius: 4, background: '#333', color: '#888', fontSize: 10, fontWeight: 'bold' }}>SILENCE</span>}
                    <span style={{ 
                      color: seg.type === 'silence' ? 'var(--text-muted)' : 'var(--text)',
                      fontStyle: seg.type !== 'speech' ? 'italic' : 'normal'
                    }}>
                      {seg.text}
                    </span>
                  </div>
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                   {analyzing ? 'Listening to audio...' : 'No transcription available.'}
                </div>
              )}
            </div>
          </section>

          {/* 4. IMAGE GENERATION */}
          <section>
            <SectionTitle number="3" title="Visual Settings" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              
              {/* Frequency */}
              <div className="card">
                <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' }}>Image Frequency</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[2, 3, 5].map(freq => (
                    <label key={freq} style={{ 
                      display: 'flex', alignItems: 'center', gap: 12, 
                      padding: 12, 
                      borderRadius: 8, 
                      border: imgFrequency === freq ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: imgFrequency === freq ? 'rgba(180, 59, 255, 0.1)' : 'transparent',
                      cursor: 'pointer'
                    }}>
                      <input 
                        type="radio" 
                        name="freq" 
                        checked={imgFrequency === freq} 
                        onChange={() => setImgFrequency(freq)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <div>
                        <div style={{ fontSize: 14 }}>Every {freq} seconds</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>~{Math.ceil((parseInt(file.duration.split(':')[0]) * 60 + parseInt(file.duration.split(':')[1]))/freq)} images total</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Video Format */}
              <div className="card">
                <label style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'block' }}>Video Format</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div 
                    onClick={() => setAspectRatio('9:16')}
                    style={{ 
                      flex: 1, 
                      aspectRatio: '9/16', 
                      border: aspectRatio === '9:16' ? '2px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      background: aspectRatio === '9:16' ? 'rgba(180, 59, 255, 0.1)' : 'transparent'
                    }}
                  >
                    <div style={{ width: 12, height: 20, border: '1px solid currentColor', marginBottom: 8, borderRadius: 2 }}></div>
                    <span style={{ fontSize: 12 }}>9:16</span>
                  </div>
                  <div 
                    onClick={() => setAspectRatio('16:9')}
                    style={{ 
                      flex: 1, 
                      aspectRatio: '16/9', 
                      border: aspectRatio === '16:9' ? '2px solid var(--accent)' : '1px solid var(--border)',
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column',
                      cursor: 'pointer',
                      background: aspectRatio === '16:9' ? 'rgba(180, 59, 255, 0.1)' : 'transparent'
                    }}
                  >
                      <div style={{ width: 20, height: 12, border: '1px solid currentColor', marginBottom: 8, borderRadius: 2 }}></div>
                      <span style={{ fontSize: 12 }}>16:9</span>
                  </div>
                </div>
              </div>

            </div>
          </section>

            {/* 5. VISUAL STYLE */}
            <section>
            <SectionTitle number="4" title="Visual Style" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {['Cinematic', 'Anime', 'Cyberpunk', 'Watercolor'].map(style => (
                  <div 
                  key={style}
                  onClick={() => setVisualStyle(style.toLowerCase())}
                  style={{
                    height: 80,
                    borderRadius: 12,
                    border: visualStyle === style.toLowerCase() ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: 'var(--panel)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 600,
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  >
                    {/* Mock background gradient to simulate style preview */}
                    <div style={{ 
                      position: 'absolute', inset: 0, opacity: 0.2, 
                      background: `linear-gradient(45deg, ${style === 'Cyberpunk' ? '#f0f' : '#333'}, #000)` 
                    }} />
                    <span style={{ position: 'relative', zIndex: 1 }}>{style}</span>
                  </div>
              ))}
            </div>
            </section>

            {/* 6. PREVIEW & CTA */}
            <section style={{ marginTop: 20 }}>
              <button 
                className="btn-primary" 
                style={{ width: '100%', padding: 20, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
                onClick={handleGenerate}
                disabled={generating || analyzing}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4V2m0 2v2m0-2h-2m2 0h2m-2 2a9 9 0 1 1-9 9 9 9 0 0 1 9-9z"/></svg>
                {generating ? 'Generating Assets...' : 'Generate Storyboard & Preview'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                Estimated cost: ~{(parseInt(file.duration.split(':')[0]) * 60 + parseInt(file.duration.split(':')[1])) * 0.5} credits
              </div>
            </section>

        </div>
      )}

      {/* CSS Animation for fade in */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
