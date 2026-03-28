import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AppConfig {
  enabledModelSizes: string[]
  mockMode: boolean
}

// Default to both sizes when API unavailable (e.g., frontend-only dev)
// Note: Voice Design requires 1.7B - only Clone and Custom Voice work with 0.6B
const DEFAULT_CONFIG: AppConfig = {
  enabledModelSizes: ['1.7B', '0.6B'],
  mockMode: false,
}

const ConfigContext = createContext<AppConfig>(DEFAULT_CONFIG)

export function useAppConfig() {
  return useContext(ConfigContext)
}

interface ConfigProviderProps {
  children: ReactNode
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig({
          enabledModelSizes: data.enabled_model_sizes || ['0.6B'],
          mockMode: data.mock_mode || false,
        })
      })
      .catch(() => {
        // Use defaults if API fails
      })
  }, [])

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  )
}
