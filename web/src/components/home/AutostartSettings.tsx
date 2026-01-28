import { useState } from 'react'
import { autostartStore, type AutostartConfig } from '@/lib/autostart'

type Props = {
  simpleMode?: boolean
}

export function AutostartSettings({ simpleMode }: Props) {
  const [config, setConfig] = useState<AutostartConfig>(autostartStore.getConfig())

  const handleToggle = (enabled: boolean) => {
    const next = autostartStore.setConfig({ enabled })
    setConfig(next)
  }

  const handleMode = (mode: AutostartConfig['mode']) => {
    const next = autostartStore.setConfig({ mode })
    setConfig(next)
  }

  if (simpleMode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Skip intro next time?</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={config.enabled} 
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{config.enabled ? 'Yes' : 'No'}</span>
        </label>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Autostart</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Skip home screen on launch</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={config.enabled} 
            onChange={(e) => handleToggle(e.target.checked)}
            style={{ width: '20px', height: '20px' }}
          />
          <span style={{ fontSize: '0.9rem' }}>{config.enabled ? 'On' : 'Off'}</span>
        </label>
      </div>

      {config.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
          <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="radio" 
              name="mode" 
              checked={config.mode === 'projects'} 
              onChange={() => handleMode('projects')} 
            />
            Open Projects Dashboard
          </label>
          <label style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="radio" 
              name="mode" 
              checked={config.mode === 'lastProject'} 
              onChange={() => handleMode('lastProject')} 
            />
            Resume Last Project
          </label>
        </div>
      )}
    </div>
  )
}
