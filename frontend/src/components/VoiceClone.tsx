import { useState, useCallback } from 'react'
import { Loader2, Play, X } from 'lucide-react'
import { FileUpload } from './FileUpload'
import { AudioPlayer } from './AudioPlayer'
import { ModelSizeSelector } from './ModelSizeSelector'
import { useTTS } from '../hooks/useTTS'
import { useAppConfig } from '../context/ConfigContext'

const LANGUAGES = [
  'Chinese', 'English', 'Japanese', 'Korean', 'German',
  'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'
]

export function VoiceClone() {
  const { enabledModelSizes } = useAppConfig()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('English')
  const [refText, setRefText] = useState('')
  const [refAudio, setRefAudio] = useState<File | null>(null)
  const [modelSize, setModelSize] = useState(enabledModelSizes[0] || '0.6B')

  const { isLoading, error, result, generateClone, cancelGeneration } = useTTS()

  const handleModelSizeChange = useCallback((size: string) => {
    setModelSize(size)
  }, [])

  const handleGenerate = async () => {
    if (!text.trim() || !refAudio || !refText.trim()) return

    const formData = new FormData()
    formData.append('text', text)
    formData.append('language', language)
    formData.append('ref_text', refText)
    formData.append('model_size', modelSize)
    formData.append('ref_audio', refAudio)

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

          {/* Reference Audio Upload */}
          <FileUpload
            onFileSelect={setRefAudio}
            label="Reference Audio (3-20 seconds)"
          />

          {/* Reference Text */}
          <div>
            <label htmlFor="clone-ref-text" className="block text-sm font-medium text-slate-300 mb-2">
              Reference Audio Transcript
            </label>
            <textarea
              id="clone-ref-text"
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              placeholder="Enter the exact transcript of the reference audio..."
              rows={2}
              className="textarea-field"
              maxLength={2000}
              aria-describedby="clone-ref-text-hint"
            />
            <p id="clone-ref-text-hint" className="text-xs text-slate-500 mt-1">
              Provide the exact words spoken in the reference audio for best results
            </p>
          </div>

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

          {/* Generate/Cancel Buttons */}
          {isLoading ? (
            <div className="flex gap-3">
              <div className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-wait">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span aria-live="polite">Generating audio...</span>
              </div>
              <button
                onClick={cancelGeneration}
                className="btn-secondary px-4 flex items-center gap-2"
                aria-label="Cancel generation"
              >
                <X className="w-5 h-5" aria-hidden="true" />
                Cancel
              </button>
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
