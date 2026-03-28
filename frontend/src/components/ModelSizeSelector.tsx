import { useEffect } from 'react'
import { useAppConfig } from '../context/ConfigContext'

interface ModelSizeSelectorProps {
  value: string
  onChange: (size: string) => void
  disabled?: boolean
}

export function ModelSizeSelector({ value, onChange, disabled }: ModelSizeSelectorProps) {
  const { enabledModelSizes } = useAppConfig()

  // Auto-select first enabled size if current value is not enabled
  useEffect(() => {
    if (!enabledModelSizes.includes(value) && enabledModelSizes.length > 0) {
      onChange(enabledModelSizes[0])
    }
  }, [enabledModelSizes, value, onChange])

  // Don't render if only one size is enabled
  if (enabledModelSizes.length <= 1) {
    return null
  }

  return (
    <div>
      <span id="model-size-label" className="block text-sm font-medium text-slate-300 mb-2">
        Model Size
      </span>
      <div role="radiogroup" aria-labelledby="model-size-label" className="flex gap-2">
        {enabledModelSizes.includes('0.6B') && (
          <button
            type="button"
            role="radio"
            aria-checked={value === '0.6B'}
            onClick={() => onChange('0.6B')}
            disabled={disabled}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              value === '0.6B'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            0.6B (Fast)
          </button>
        )}
        {enabledModelSizes.includes('1.7B') && (
          <button
            type="button"
            role="radio"
            aria-checked={value === '1.7B'}
            onClick={() => onChange('1.7B')}
            disabled={disabled}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              value === '1.7B'
                ? 'bg-primary-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            1.7B (Quality)
          </button>
        )}
      </div>
    </div>
  )
}
