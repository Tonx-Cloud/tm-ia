import { useEffect, useState } from 'react'
import { t, type Locale } from '@/i18n'
import type { Asset, StoryboardItem } from '@/lib/assetsApi'
import { updateStoryboard, snapshotRender } from '@/lib/assetsApi'

// Mock data for immediate visualization
const MOCK_ASSETS: Asset[] = [
  { id: 'm1', prompt: 'Cinematic shot of a woman on a beach during a storm, wind blowing hair, dramatic lighting', dataUrl: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80', status: 'generated' },
  { id: 'm2', prompt: 'Ocean waves crashing violently against dark rocks, moody atmosphere', dataUrl: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80', status: 'generated' },
  { id: 'm3', prompt: 'Close up of rain drops falling on a window, blurred city lights in background', dataUrl: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80', status: 'generated' },
]

const MOCK_STORYBOARD: StoryboardItem[] = [
  { assetId: 'm1', durationSec: 4, animate: true, position: 'center' },
  { assetId: 'm2', durationSec: 3, animate: false, position: 'center' },
  { assetId: 'm3', durationSec: 5, animate: true, position: 'center' },
]

type Props = {
  locale?: Locale
  projectId?: string | null
  token?: string
  assets: Asset[]
  storyboard?: StoryboardItem[]
  onUpdate?: (items: StoryboardItem[]) => void
  onError?: (msg: string) => void
}

// Simple Icons
const Icons = {
  Play: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>,
  Pause: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>,
  Maximize: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>,
  Wand: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4V2m0 2v2m0-2h-2m2 0h2m-2 2a9 9 0 1 1-9 9 9 9 0 0 1 9-9z"/></svg>,
  Clock: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
  MoveUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  MoveDown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
}

export function StoryboardEditor({ locale = 'en', projectId, token, assets, storyboard = [], onUpdate, onError }: Props) {
  const [items, setItems] = useState<StoryboardItem[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null)
  
  // New state for UI
  const [activeSceneIdx, setActiveSceneIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Determine display data (use mocks if empty/no project)
  const displayItems = (items.length > 0 ? items : (assets.length === 0 ? MOCK_STORYBOARD : []))
  const displayAssets = (assets.length > 0 ? assets : MOCK_ASSETS)

  useEffect(() => {
    if (storyboard && storyboard.length > 0) {
        setItems(storyboard)
    } else if (items.length === 0 && assets.length === 0) {
        setItems(MOCK_STORYBOARD)
    }
  }, [storyboard, assets])

  const move = (idx: number, dir: -1 | 1) => {
    let currentList = items.length > 0 ? [...items] : [...MOCK_STORYBOARD]
    
    const target = idx + dir
    if (target < 0 || target >= currentList.length) return
    const tmp = currentList[target]
    currentList[target] = currentList[idx]
    currentList[idx] = tmp
    setItems(currentList)
    setSaved(false)
    if (activeSceneIdx === idx) setActiveSceneIdx(target)
    else if (activeSceneIdx === target) setActiveSceneIdx(idx)
  }

  const updateField = (idx: number, patch: Partial<StoryboardItem>) => {
    let currentList = items.length > 0 ? [...items] : [...MOCK_STORYBOARD]
    currentList[idx] = { ...currentList[idx], ...patch }
    setItems(currentList)
    setSaved(false)
  }

  const handleSave = async () => {
    if (!projectId || !token) return
    setSaving(true)
    try {
      const resp = await updateStoryboard(projectId, items, token)
      setItems(resp.project.storyboard)
      onUpdate?.(resp.project.storyboard)
      setSaved(true)
      setSnapshotStatus(null)
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleSnapshot = async () => {
    if (!projectId || !token) return
    setSnapshotStatus(t('state.processing', locale))
    try {
      const resp = await snapshotRender(projectId, token)
      setSnapshotStatus(resp.reused ? t('story.snapshot.reused', locale) : t('story.snapshot.saved', locale))
    } catch (err) {
      const msg = (err as Error).message
      setSnapshotStatus(msg)
      onError?.(msg)
    }
  }

  // Calculate total duration for timestamp display
  const getStartTime = (idx: number) => {
    let time = 0
    for (let i = 0; i < idx; i++) {
      time += displayItems[i].durationSec || 5
    }
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const activeItem = displayItems[activeSceneIdx]
  const activeAsset = activeItem ? displayAssets.find(a => a.id === activeItem.assetId) : null

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: 'minmax(350px, 450px) 1fr', 
      gap: 24, 
      height: 'calc(100vh - 120px)', // Fit within the shell content
      marginTop: 0
    }}>
      
      {/* LEFT PANEL: SCENE LIST / SCRIPT */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        background: 'var(--panel)', 
        borderRadius: 'var(--radius)', 
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        {/* Toolbar */}
        <div style={{ 
          padding: '16px 20px', 
          borderBottom: '1px solid var(--border)',
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{t('story.title', locale)}</div>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saved && <span className="badge-soft" style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>Saved</span>}
            {snapshotStatus && <span className="badge-soft">{snapshotStatus}</span>}
            
            <button 
              className="btn-ghost" 
              onClick={handleSave} 
              disabled={saving || !projectId || !token}
              style={{ fontSize: 13, padding: '6px 12px' }}
            >
              {saving ? '...' : t('story.save', locale)}
            </button>
            <button 
              className="btn-primary" 
              onClick={handleSnapshot} 
              disabled={!projectId || !token || saving}
              style={{ fontSize: 13, padding: '6px 12px' }}
            >
              Export
            </button>
          </div>
        </div>

        {/* List Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayItems.map((item, idx) => {
            const asset = displayAssets.find((a) => a.id === item.assetId)
            const isActive = idx === activeSceneIdx
            
            return (
              <div 
                key={item.assetId}
                onClick={() => setActiveSceneIdx(idx)}
                style={{
                  display: 'flex',
                  gap: 16,
                  padding: 12,
                  borderRadius: 12,
                  background: isActive ? 'rgba(180, 59, 255, 0.08)' : 'transparent',
                  border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {/* Text/Script Section */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ 
                    fontSize: 12, 
                    color: 'var(--text-muted)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6 
                  }}>
                    <span style={{ fontFamily: 'monospace' }}>{getStartTime(idx)}</span>
                    {isActive && <span className="badge-soft" style={{ fontSize: 10, padding: '2px 6px' }}>Active</span>}
                  </div>
                  
                  <div style={{ 
                    fontSize: 14, 
                    lineHeight: 1.5, 
                    color: 'var(--text)',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {asset?.prompt || "No script text available for this scene."}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                      <span style={{ opacity: 0.5 }}>Speaker:</span>
                      <span>AI Voice</span>
                    </div>
                  </div>
                </div>

                {/* Thumbnail Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                  <div style={{ 
                    width: 100, 
                    height: 56, 
                    borderRadius: 8,
                    background: asset?.dataUrl ? `center / cover url(${asset.dataUrl})` : '#333',
                    border: '1px solid var(--border)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      position: 'absolute', 
                      bottom: 4, 
                      right: 4, 
                      background: 'rgba(0,0,0,0.7)', 
                      color: 'white', 
                      fontSize: 10, 
                      padding: '2px 4px', 
                      borderRadius: 4,
                      fontWeight: 600
                    }}>
                      {item.durationSec}s
                    </div>
                  </div>

                  {/* Actions (visible on hover or active) */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button 
                      className="btn-ghost" 
                      style={{ padding: 4, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => { e.stopPropagation(); move(idx, -1) }}
                      disabled={idx === 0}
                    >
                      <Icons.MoveUp />
                    </button>
                    <button 
                      className="btn-ghost" 
                      style={{ padding: 4, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => { e.stopPropagation(); move(idx, 1) }}
                      disabled={idx === displayItems.length - 1}
                    >
                      <Icons.MoveDown />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
          
          {displayItems.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              No scenes yet. Generate images to create your storyboard.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: PREVIEW */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 16 
      }}>
        {/* Player Container */}
        <div style={{ 
          flex: 1, 
          background: '#000', 
          borderRadius: 16, 
          border: '1px solid var(--border)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
           {/* Preview Image/Video */}
           <div style={{ 
             flex: 1, 
             display: 'flex', 
             alignItems: 'center', 
             justifyContent: 'center',
             background: activeAsset?.dataUrl ? `center / contain no-repeat url(${activeAsset.dataUrl})` : 'transparent',
             backgroundColor: '#050505'
           }}>
             {!activeAsset && (
               <div style={{ color: 'var(--text-muted)' }}>Select a scene to preview</div>
             )}
             
             {/* Text Overlay Simulation */}
             {activeAsset && (
               <div style={{ 
                 position: 'absolute', 
                 bottom: '15%', 
                 left: 0, 
                 right: 0, 
                 textAlign: 'center', 
                 padding: '0 40px',
                 textShadow: '0 2px 4px rgba(0,0,0,0.8)'
               }}>
                 <div style={{ fontSize: 20, fontWeight: 600, color: 'white' }}>
                   {activeAsset.prompt.substring(0, 80)}{activeAsset.prompt.length > 80 ? '...' : ''}
                 </div>
               </div>
             )}
           </div>

           {/* Player Controls Bar */}
           <div style={{ 
             height: 64, 
             background: 'rgba(20, 20, 25, 0.9)', 
             borderTop: '1px solid var(--border)',
             display: 'flex',
             alignItems: 'center',
             padding: '0 24px',
             gap: 24
           }}>
             <button 
               className="btn-ghost" 
               style={{ border: 'none', padding: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
               onClick={() => setIsPlaying(!isPlaying)}
             >
               {isPlaying ? <Icons.Pause /> : <Icons.Play />}
             </button>

             <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>00:00:00</span>
                {/* Fake Progress Bar */}
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative' }}>
                  <div style={{ width: '30%', height: '100%', background: 'var(--accent)', borderRadius: 2 }}></div>
                  <div style={{ position: 'absolute', left: '30%', top: '50%', transform: 'translate(-50%, -50%)', width: 12, height: 12, background: 'white', borderRadius: '50%' }}></div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>00:01:00</span>
             </div>

             <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>16:9</div>
                <button className="btn-ghost" style={{ border: 'none', padding: 0 }}>
                  <Icons.Maximize />
                </button>
             </div>
           </div>
        </div>

        {/* Scene Properties Editor (Bottom of Right Panel) */}
        {activeItem && (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Scene Settings
            </div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Duration (seconds)</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="input"
                  value={activeItem.durationSec}
                  onChange={(e) => updateField(activeSceneIdx, { durationSec: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                  style={{ 
                    padding: '8px 12px', 
                    borderRadius: 8, 
                    border: '1px solid var(--border)', 
                    background: 'rgba(0,0,0,0.2)',
                    color: 'var(--text)',
                    width: 100
                  }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Animation</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 42 }}>
                  <input
                    type="checkbox"
                    checked={activeItem.animate}
                    onChange={(e) => updateField(activeSceneIdx, { animate: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 14 }}>Enable Zoom/Pan</span>
                </div>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Position</span>
                <select
                  value={activeItem.position || 'center'}
                  onChange={(e) => updateField(activeSceneIdx, { position: e.target.value })}
                  style={{ 
                    padding: '8px 12px', 
                    borderRadius: 8, 
                    border: '1px solid var(--border)', 
                    background: 'rgba(0,0,0,0.2)',
                    color: 'var(--text)',
                    width: 140
                  }}
                >
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
