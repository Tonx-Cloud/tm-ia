import { useEffect, useState } from 'react'
import { autostartStore } from '@/lib/autostart'
import { FirstRunEmptyState } from '@/components/home/FirstRunEmptyState'
import { ProjectsDashboard } from '@/components/home/ProjectsDashboard'
import { AutostartSettings } from '@/components/home/AutostartSettings'
import type { Locale } from '@/i18n'

type Props = {
  locale?: Locale
  onNewProject: () => void
  onContinueProject: (projectId: string) => void
  onNavigateProjects: () => void
}

export function Home({ locale = 'en', onNewProject, onContinueProject, onNavigateProjects }: Props) {
  const [ready, setReady] = useState(false)
  const [lastProjectId, setLastProjectId] = useState<string | null>(null)

  useEffect(() => {
    const config = autostartStore.getConfig()
    const lastId = autostartStore.getLastProjectId()
    setLastProjectId(lastId)

    if (config.enabled) {
      if (config.mode === 'lastProject' && lastId) {
        onContinueProject(lastId)
        return
      }
      if (config.mode === 'projects') {
        onNavigateProjects()
        return
      }
    }
    setReady(true)
  }, [onContinueProject, onNavigateProjects])

  if (!ready) return null // ou Loading spinner

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {lastProjectId ? (
        <>
          <ProjectsDashboard 
            locale={locale} 
            lastProjectId={lastProjectId} 
            onContinue={() => onContinueProject(lastProjectId)} 
            onNewProject={onNewProject}
          />
          <div style={{ position: 'fixed', bottom: '20px', left: '20px', zIndex: 10 }}>
            <AutostartSettings />
          </div>
        </>
      ) : (
        <FirstRunEmptyState 
          locale={locale} 
          onNewProject={onNewProject} 
        />
      )}
    </div>
  )
}
