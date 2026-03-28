import { useState, useCallback, useEffect } from 'react'
import { Loader2, Play, X, User, AlertCircle } from 'lucide-react'
import { AudioPlayer } from './AudioPlayer'
import { ModelSizeSelector } from './ModelSizeSelector'
import { usePersonalities } from '../hooks/usePersonalities'
import { useAppConfig } from '../context/ConfigContext'

interface GenerationResult {
  audio_url: string
  filename: string
  duration: number | null
  sample_rate: number
}

export function PersonalityGenerate() {
  const { enabledModelSizes } = useAppConfig()
  const { personalities, isLoading: isLoadingPersonalities, error: personalitiesError } = usePersonalities()

  const [selectedPersonalityId, setSelectedPersonalityId] = useState<string>('')
  const [text, setText] = useState('')
  const [modelSize, setModelSize] = useState(enabledModelSizes[0] || '1.7B')

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const abortControllerRef = { current: null as AbortController | null }

  // Auto-select first personality when loaded
  useEffect(() => {
    if (personalities.length > 0 && !selectedPersonalityId) {
      setSelectedPersonalityId(personalities[0].id)
    }
  }, [personalities, selectedPersonalityId])

  const selectedPersonality = personalities.find(p => p.id === selectedPersonalityId)

  const handleModelSizeChange = useCallback((size: string) => {
    setModelSize(size)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!text.trim() || !selectedPersonalityId) return

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsGenerating(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('personality_id', selectedPersonalityId)
      formData.append('text', text)
      formData.append('model_size', modelSize)

      const response = await fetch('/api/generate/personality', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Generation failed')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Generation cancelled')
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }, [text, selectedPersonalityId, modelSize])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsGenerating(false)
      setError('Generation cancelled')
    }
  }, [])

  const isValid = text.trim() && selectedPersonalityId

  // Show message if no personalities
  if (!isLoadingPersonalities && personalities.length === 0) {
    return (
      <div className="space-y-6">
        <div className="card">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No personalities available</h3>
            <p className="text-sm text-slate-400 mb-4">
              Create a voice personality first to use this feature
            </p>
            <p className="text-xs text-slate-500">
              Go to the Personalities tab to create one
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">Generate with Personality</h2>
        <p className="text-sm text-slate-400 mb-6">
          Use a saved voice personality to generate speech quickly
        </p>

        {/* Error from loading personalities */}
        {personalitiesError && (
          <div className="flex items-center gap-2 p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{personalitiesError}</span>
          </div>
        )}

        <div className="space-y-5">
          {/* Personality Selection */}
          <div>
            <label htmlFor="personality-select" className="block text-sm font-medium text-slate-300 mb-2">
              Voice Personality
            </label>
            {isLoadingPersonalities ? (
              <div className="flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-lg">
                <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />
                <span className="text-sm text-slate-400">Loading personalities...</span>
              </div>
            ) : (
              <select
                id="personality-select"
                value={selectedPersonalityId}
                onChange={(e) => setSelectedPersonalityId(e.target.value)}
                className="select-field"
              >
                {personalities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.language})
                  </option>
                ))}
              </select>
            )}

            {/* Selected personality info */}
            {selectedPersonality && (
              <div className="mt-2 p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-primary-400" />
                  <span className="text-white font-medium">{selectedPersonality.name}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-400">{selectedPersonality.language}</span>
                  {selectedPersonality.audio_duration && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-400">{selectedPersonality.audio_duration.toFixed(1)}s ref</span>
                    </>
                  )}
                </div>
                {selectedPersonality.description && (
                  <p className="text-xs text-slate-500 mt-1">{selectedPersonality.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Text to speak */}
          <div>
            <label htmlFor="generate-text" className="block text-sm font-medium text-slate-300 mb-2">
              Text to Speak
            </label>
            <textarea
              id="generate-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={4}
              className="textarea-field"
              maxLength={5000}
              aria-describedby="generate-text-count"
            />
            <p id="generate-text-count" className="text-xs text-slate-500 mt-1">
              {text.length}/5000 characters
            </p>
          </div>

          {/* Model Size */}
          <ModelSizeSelector
            value={modelSize}
            onChange={handleModelSizeChange}
            disabled={isGenerating}
          />

          {/* Generate/Cancel Buttons */}
          {isGenerating ? (
            <div className="flex gap-3">
              <div className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-wait">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating audio...</span>
              </div>
              <button
                onClick={handleCancel}
                className="btn-secondary px-4 flex items-center gap-2"
                aria-label="Cancel generation"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!isValid || isLoadingPersonalities}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" />
              Generate Speech
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <AudioPlayer
          audioUrl={result.audio_url}
          filename={result.filename}
          duration={result.duration}
        />
      )}
    </div>
  )
}
