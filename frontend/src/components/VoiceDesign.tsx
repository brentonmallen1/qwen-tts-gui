import { useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import { AudioPlayer } from './AudioPlayer'
import { useTTS } from '../hooks/useTTS'

const LANGUAGES = [
  'Chinese', 'English', 'Japanese', 'Korean', 'German',
  'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'
]

const VOICE_EXAMPLES = [
  "Bright, slightly edgy young female voice with energetic tone",
  "Deep male voice, mid-40s, authoritative but friendly",
  "Warm, gentle young female voice with a hint of playfulness",
  "Seasoned male voice with low, mellow timbre and calm delivery",
  "Speak with enthusiasm and excitement in your voice",
]

export function VoiceDesign() {
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('English')
  const [instruct, setInstruct] = useState('')

  const { isLoading, error, result, generateDesign, cancelGeneration } = useTTS()

  const handleGenerate = async () => {
    if (!text.trim() || !instruct.trim()) return

    await generateDesign({
      text,
      language,
      instruct,
    })
  }

  const isValid = text.trim() && instruct.trim()

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">Voice Design</h2>
        <p className="text-sm text-slate-400 mb-6">
          Create a unique voice from a natural language description. Be specific about gender, age, tone, and style.
        </p>

        <div className="space-y-5">
          {/* Text to speak */}
          <div>
            <label htmlFor="design-text" className="block text-sm font-medium text-slate-300 mb-2">
              Text to Speak
            </label>
            <textarea
              id="design-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={4}
              className="textarea-field"
              maxLength={5000}
              aria-describedby="design-text-count"
            />
            <p id="design-text-count" className="text-xs text-slate-500 mt-1">{text.length}/5000 characters</p>
          </div>

          {/* Voice Description */}
          <div>
            <label htmlFor="design-voice-desc" className="block text-sm font-medium text-slate-300 mb-2">
              Voice Description
            </label>
            <textarea
              id="design-voice-desc"
              value={instruct}
              onChange={(e) => setInstruct(e.target.value)}
              placeholder="Describe the voice you want to create..."
              rows={3}
              className="textarea-field"
              maxLength={2000}
              aria-describedby="design-voice-desc-hint"
            />
            <p id="design-voice-desc-hint" className="text-xs text-slate-500 mt-1">
              Be specific: gender, age, emotion, speaking style, accent
            </p>
          </div>

          {/* Quick Examples */}
          <div>
            <span id="quick-examples-label" className="block text-sm font-medium text-slate-300 mb-2">
              Quick Examples
            </span>
            <div role="group" aria-labelledby="quick-examples-label" className="flex flex-wrap gap-2">
              {VOICE_EXAMPLES.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => setInstruct(example)}
                  aria-label={`Use example: ${example}`}
                  className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600
                           text-slate-300 rounded-full transition-colors"
                >
                  {example.slice(0, 30)}...
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label htmlFor="design-language" className="block text-sm font-medium text-slate-300 mb-2">
              Language
            </label>
            <select
              id="design-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="select-field"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {/* Model Info */}
          <div className="p-3 bg-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400">
              <span className="text-primary-400 font-medium">Note:</span> Voice Design uses the 1.7B model for best quality.
            </p>
          </div>

          {/* Generate/Cancel Buttons */}
          {isLoading ? (
            <div className="flex gap-3">
              <div className="flex-1 btn-primary flex items-center justify-center gap-2 cursor-wait">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span aria-live="polite">Designing voice...</span>
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
              <Sparkles className="w-5 h-5" aria-hidden="true" />
              Design & Generate
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
