import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Play, User, X } from 'lucide-react'
import { AudioPlayer } from './AudioPlayer'
import { ModelSizeSelector } from './ModelSizeSelector'
import { useTTS } from '../hooks/useTTS'
import { useAppConfig } from '../context/ConfigContext'

// Languages that have preset speakers
const SPEAKER_LANGUAGES = ['Chinese', 'English', 'Japanese', 'Korean'] as const

// All supported languages for TTS output
const ALL_LANGUAGES = [
  'Chinese', 'English', 'Japanese', 'Korean', 'German',
  'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'
]

const SPEAKERS = [
  { id: 'Vivian', name: 'Vivian', lang: 'Chinese', desc: 'Bright, slightly edgy young female' },
  { id: 'Serena', name: 'Serena', lang: 'Chinese', desc: 'Warm, gentle young female' },
  { id: 'Uncle_Fu', name: 'Uncle Fu', lang: 'Chinese', desc: 'Seasoned male, low mellow timbre' },
  { id: 'Dylan', name: 'Dylan', lang: 'Chinese', desc: 'Youthful Beijing male, clear timbre' },
  { id: 'Eric', name: 'Eric', lang: 'Chinese', desc: 'Lively Sichuan male, husky brightness' },
  { id: 'Ryan', name: 'Ryan', lang: 'English', desc: 'Dynamic male, strong rhythmic drive' },
  { id: 'Aiden', name: 'Aiden', lang: 'English', desc: 'Sunny American male, clear midrange' },
  { id: 'Ono_Anna', name: 'Ono Anna', lang: 'Japanese', desc: 'Playful Japanese female, light timbre' },
  { id: 'Sohee', name: 'Sohee', lang: 'Korean', desc: 'Warm Korean female, rich emotion' },
]

export function CustomVoice() {
  const { enabledModelSizes } = useAppConfig()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('English')
  const [speaker, setSpeaker] = useState('Ryan')
  const [instruct, setInstruct] = useState('')
  const [modelSize, setModelSize] = useState(enabledModelSizes[0] || '0.6B')

  const { isLoading, error, result, generateCustom, cancelGeneration } = useTTS()

  const handleModelSizeChange = useCallback((size: string) => {
    setModelSize(size)
  }, [])

  // Filter speakers by selected language
  const availableSpeakers = useMemo(() =>
    SPEAKERS.filter(s => s.lang === language),
    [language]
  )

  // Auto-select first available speaker when language changes
  useEffect(() => {
    const currentSpeakerValid = availableSpeakers.some(s => s.id === speaker)
    if (!currentSpeakerValid && availableSpeakers.length > 0) {
      setSpeaker(availableSpeakers[0].id)
    }
  }, [language, availableSpeakers, speaker])

  const handleGenerate = async () => {
    if (!text.trim()) return

    await generateCustom({
      text,
      language,
      speaker,
      instruct: instruct.trim() || undefined,
      model_size: modelSize,
    })
  }

  const selectedSpeaker = SPEAKERS.find(s => s.id === speaker)
  const isValid = text.trim()

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-1">Custom Voice</h2>
        <p className="text-sm text-slate-400 mb-6">
          Use preset voices with optional emotional/style instructions.
        </p>

        <div className="space-y-5">
          {/* Text to speak */}
          <div>
            <label htmlFor="custom-text" className="block text-sm font-medium text-slate-300 mb-2">
              Text to Speak
            </label>
            <textarea
              id="custom-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={4}
              className="textarea-field"
              maxLength={5000}
              aria-describedby="custom-text-count"
            />
            <p id="custom-text-count" className="text-xs text-slate-500 mt-1">{text.length}/5000 characters</p>
          </div>

          {/* Language Selection */}
          <div>
            <span id="custom-language-label" className="block text-sm font-medium text-slate-300 mb-2">
              Language
            </span>
            <div role="radiogroup" aria-labelledby="custom-language-label" aria-describedby="custom-language-hint" className="flex flex-wrap gap-2">
              {ALL_LANGUAGES.map((lang) => {
                const hasSpeakers = SPEAKER_LANGUAGES.includes(lang as typeof SPEAKER_LANGUAGES[number])
                return (
                  <button
                    key={lang}
                    role="radio"
                    aria-checked={language === lang}
                    onClick={() => setLanguage(lang)}
                    disabled={!hasSpeakers}
                    aria-disabled={!hasSpeakers}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      language === lang
                        ? 'bg-primary-600 text-white'
                        : hasSpeakers
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {lang}
                  </button>
                )
              })}
            </div>
            <p id="custom-language-hint" className="text-xs text-slate-500 mt-2">
              Preset speakers available for Chinese, English, Japanese, and Korean
            </p>
          </div>

          {/* Speaker Selection */}
          <div>
            <span id="custom-speaker-label" className="block text-sm font-medium text-slate-300 mb-2">
              Select Speaker
            </span>
            <div role="radiogroup" aria-labelledby="custom-speaker-label" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {availableSpeakers.map((s) => (
                <button
                  key={s.id}
                  role="radio"
                  aria-checked={speaker === s.id}
                  onClick={() => setSpeaker(s.id)}
                  aria-label={`${s.name}: ${s.desc}`}
                  className={`p-3 rounded-lg text-left transition-colors ${
                    speaker === s.id
                      ? 'bg-primary-600 ring-2 ring-primary-400'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4" aria-hidden="true" />
                    <span className="font-medium text-sm">{s.name}</span>
                  </div>
                </button>
              ))}
            </div>
            {selectedSpeaker && (
              <p className="text-xs text-slate-400 mt-2" aria-live="polite">
                {selectedSpeaker.desc}
              </p>
            )}
          </div>

          {/* Model Size */}
          <ModelSizeSelector
            value={modelSize}
            onChange={handleModelSizeChange}
            disabled={isLoading}
          />

          {/* Optional Instruction */}
          <div>
            <label htmlFor="custom-instruct" className="block text-sm font-medium text-slate-300 mb-2">
              Style Instruction <span className="text-slate-500">(Optional)</span>
            </label>
            <input
              id="custom-instruct"
              type="text"
              value={instruct}
              onChange={(e) => setInstruct(e.target.value)}
              placeholder="e.g., Speak with enthusiasm, Use a calm tone..."
              className="input-field"
              maxLength={500}
            />
          </div>

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
