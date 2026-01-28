// Gerenciamento de preferências de inicialização (Autostart)

export type AutostartMode = 'lastProject' | 'projects'

export interface AutostartConfig {
  enabled: boolean
  mode: AutostartMode
}

const STORAGE_KEY_CONFIG = 'tm_ia_autostart_config'
const STORAGE_KEY_LAST_PROJECT = 'tm_ia_last_project_id'

const DEFAULT_CONFIG: AutostartConfig = {
  enabled: false,
  mode: 'projects' // ou 'lastProject'
}

export const autostartStore = {
  getConfig: (): AutostartConfig => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG)
      return stored ? JSON.parse(stored) : DEFAULT_CONFIG
    } catch {
      return DEFAULT_CONFIG
    }
  },

  setConfig: (config: Partial<AutostartConfig>) => {
    const current = autostartStore.getConfig()
    const newConfig = { ...current, ...config }
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(newConfig))
    return newConfig
  },

  getLastProjectId: (): string | null => {
    return localStorage.getItem(STORAGE_KEY_LAST_PROJECT)
  },

  setLastProjectId: (projectId: string) => {
    localStorage.setItem(STORAGE_KEY_LAST_PROJECT, projectId)
  },
  
  clearLastProjectId: () => {
    localStorage.removeItem(STORAGE_KEY_LAST_PROJECT)
  }
}
