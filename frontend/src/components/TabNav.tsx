import { Mic, Sparkles, Users, UserCircle, Play } from 'lucide-react'
import { useAppConfig } from '../context/ConfigContext'

export type TabType = 'clone' | 'design' | 'custom' | 'personalities' | 'personality-generate'

interface TabNavProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

const tabs = [
  { id: 'clone' as const, label: 'Voice Clone', icon: Mic, requires1_7B: false },
  { id: 'design' as const, label: 'Voice Design', icon: Sparkles, requires1_7B: true },
  { id: 'custom' as const, label: 'Custom Voice', icon: Users, requires1_7B: false },
  { id: 'personalities' as const, label: 'Personalities', icon: UserCircle, requires1_7B: false },
  { id: 'personality-generate' as const, label: 'Generate', icon: Play, requires1_7B: false },
]

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const { enabledModelSizes } = useAppConfig()
  const has1_7B = enabledModelSizes.includes('1.7B')

  return (
    <div role="tablist" aria-label="Voice generation modes" className="flex gap-2 p-1 bg-slate-800/50 rounded-xl mb-8">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        const isDisabled = tab.requires1_7B && !has1_7B

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${tab.id}-panel`}
            id={`${tab.id}-tab`}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-label={isDisabled ? `${tab.label} (requires 1.7B model)` : tab.label}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg
              font-medium text-sm transition-colors duration-200
              ${isActive
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25'
                : isDisabled
                  ? 'text-slate-500 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }
            `}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
