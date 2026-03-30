import { useState, useCallback, useRef, useEffect } from 'react'
import { Loader2, Play, X, Download } from 'lucide-react'
import { AudioEditor, AudioEditorHandle } from './AudioEditor'
import { AudioPlayer } from './AudioPlayer'
import { ModelSizeSelector } from './ModelSizeSelector'
import { useTTS } from '../hooks/useTTS'
import { useAppConfig } from '../context/ConfigContext'

const LANGUAGES = [
  'Chinese', 'English', 'Japanese', 'Korean', 'German',
  'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'
]

interface ModelInfo {
  name: string
  size: string
  mode: string
  loaded: boolean
  downloaded: boolean
}

export function VoiceClone() {
  const { enabledModelSizes } = useAppConfig()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('English')
  const [refText, setRefText] = useState('')
  const [refAudio, setRefAudio] = useState<Blob | null>(null)
  const [modelSize, setModelSize] = useState(enabledModelSizes[0] || '0.6B')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])

  const audioEditorRef = useRef<AudioEditorHandle>(null)

  const { isLoading, error, result, generateClone, cancelGeneration } = useTTS()

  // Fetch model status
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => setModels(data.models || []))
      .catch(() => {})
  }, [])

  // Check if current model is downloaded
  const currentModel = models.find(m => m.mode === 'clone' && m.size === modelSize)
  const isModelDownloaded = currentModel?.downloaded ?? true
  const isModelLoaded = currentModel?.loaded ?? false

  const handleModelSizeChange = useCallback((size: string) => {
    setModelSize(size)
  }, [])

  const handleAudioChange = useCallback((blob: Blob | null) => {
    setRefAudio(blob)
    if (!blob) {
      setRefText('')
    }
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (!audioEditorRef.current) return

    setIsTranscribing(true)
    try {
      // Get the selected portion of audio, not the full file
      const selectedAudio = await audioEditorRef.current.getSelectedAudio()
      if (!selectedAudio) {
        throw new Error('Could not get selected audio')
      }

      const formData = new FormData()
      formData.append('audio', selectedAudio, 'audio.wav')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Transcription failed')
      }

      const data = await response.json()
      if (data.transcript) {
        setRefText(data.transcript)
      }
    } catch (err) {
      console.error('Transcription error:', err)
    } finally {
      setIsTranscribing(false)
    }
  }, [])

  const handleGenerate = async () => {
    if (!text.trim() || !refAudio || !refText.trim() || !audioEditorRef.current) return

    // Get the selected portion of audio, not the full file
    const selectedAudio = await audioEditorRef.current.getSelectedAudio()
    if (!selectedAudio) {
      console.error('Could not get selected audio')
      return
    }

    const formData = new FormData()
    formData.append('text', text)
    formData.append('language', language)
    formData.append('ref_text', refText)
    formData.append('model_size', modelSize)
    formData.append('ref_audio', selectedAudio, 'reference.wav')

    await generateClone(formData)
  }

  const isValid = text.trim() && refAudio && refText.trim()

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">Voice Cloning</h2>
        <p className="text-sm text-slate-400 mb-6">
          Clone a voice from a reference audio sample. Upload 3-20 seconds of clear audio.
        </p>

        <div className="space-y-5">
          {/* Text to speak */}
          <div>
            <label htmlFor="clone-text" className="block text-sm font-medium text-slate-300 mb-2">
              Text to Speak
            </label>
            <textarea
              id="clone-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={4}
              className="textarea-field"
              maxLength={5000}
              aria-describedby="clone-text-count"
            />
            <p id="clone-text-count" className="text-xs text-slate-500 mt-1">{text.length}/5000 characters</p>
          </div>

          {/* Reference Audio with Editor */}
          <AudioEditor
            ref={audioEditorRef}
            onAudioChange={handleAudioChange}
            transcript={refText}
            onTranscriptChange={setRefText}
            onTranscribe={refAudio ? handleTranscribe : undefined}
            isTranscribing={isTranscribing}
            label="Reference Audio (3-20 seconds)"
          />

          {/* Language */}
          <div>
            <label htmlFor="clone-language" className="block text-sm font-medium text-slate-300 mb-2">
              Language
            </label>
            <select
              id="clone-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="select-field"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {/* Model Size */}
          <ModelSizeSelector
            value={modelSize}
            onChange={handleModelSizeChange}
            disabled={isLoading}
          />

          {/* Model download warning */}
          {!isModelDownloaded && !isLoading && (
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
              <Download className="w-5 h-5 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium">Model not downloaded</p>
                <p className="text-amber-400/80">First generation will download ~3GB. This may take several minutes.</p>
              </div>
            </div>
          )}

          {/* Generate/Cancel Buttons */}
          {isLoading ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled
                  className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-wait"
                >
                  <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  <span aria-live="polite">
                    {!isModelDownloaded
                      ? 'Downloading model... (this may take a few minutes)'
                      : !isModelLoaded
                        ? 'Loading model...'
                        : 'Generating audio...'
                    }
                  </span>
                </button>
                <button
                  onClick={cancelGeneration}
                  className="btn-secondary px-4 flex items-center gap-2"
                  aria-label="Cancel generation"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                  Cancel
                </button>
              </div>
              {!isModelDownloaded && (
                <p className="text-xs text-slate-400 text-center">
                  First-time setup downloads the AI model. Subsequent generations will be much faster.
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!isValid}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5" aria-hidden="true" />
              Generate Speech
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" aria-live="assertive" className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
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
