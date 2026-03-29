import { useState, useCallback, useRef } from 'react'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { AudioEditor, AudioEditorHandle } from './AudioEditor'
import { Personality, Segment } from '../hooks/usePersonalities'

const LANGUAGES = [
  'Chinese', 'English', 'Japanese', 'Korean', 'German',
  'French', 'Russian', 'Portuguese', 'Spanish', 'Italian'
]

interface PersonalityFormProps {
  personality?: Personality | null
  onSubmit: (data: FormData | { name?: string; description?: string; language?: string }, audioFormData?: FormData) => Promise<boolean>
  onCancel: () => void
  transcribeAudio: (audioBlob: Blob) => Promise<string | null>
  isLoading: boolean
}

export function PersonalityForm({
  personality,
  onSubmit,
  onCancel,
  transcribeAudio,
  isLoading,
}: PersonalityFormProps) {
  const isEditing = !!personality

  const [name, setName] = useState(personality?.name || '')
  const [description, setDescription] = useState(personality?.description || '')
  const [language, setLanguage] = useState(personality?.language || 'English')
  const [transcript, setTranscript] = useState(personality?.transcript || '')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [segments, setSegments] = useState<Segment[]>(personality?.segments || [])
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [audioChanged, setAudioChanged] = useState(false)

  const audioEditorRef = useRef<AudioEditorHandle>(null)

  const handleAudioChange = useCallback((blob: Blob | null) => {
    setAudioBlob(blob)
    setAudioChanged(true)
    if (!blob) {
      setTranscript('')
    }
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (!audioEditorRef.current) return

    setIsTranscribing(true)
    try {
      // Use gathered (concatenated segments) audio if available, otherwise fall back to selected audio
      const gatheredAudio = audioEditorRef.current.getGatheredAudio()
      const audioToTranscribe = gatheredAudio || await audioEditorRef.current.getSelectedAudio()
      if (!audioToTranscribe) {
        console.error('Could not get audio')
        return
      }

      const result = await transcribeAudio(audioToTranscribe)
      if (result) {
        setTranscript(result)
      }
    } finally {
      setIsTranscribing(false)
    }
  }, [transcribeAudio])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    // Get full audio and segments from the editor
    const fullAudio = audioEditorRef.current
      ? await audioEditorRef.current.getFullAudio()
      : audioBlob
    const currentSegments = audioEditorRef.current
      ? audioEditorRef.current.getSegments()
      : segments

    if (isEditing) {
      // Update existing personality
      const metadataChanged =
        name !== personality.name ||
        description !== (personality.description || '') ||
        language !== personality.language

      const metadata = metadataChanged
        ? { name, description, language }
        : undefined

      // Always send audio form data when segments changed or audio changed
      const segmentsChanged = JSON.stringify(currentSegments) !== JSON.stringify(personality.segments)
      let audioFormData: FormData | undefined
      if (audioChanged || segmentsChanged || transcript !== personality.transcript) {
        audioFormData = new FormData()
        audioFormData.append('transcript', transcript)
        audioFormData.append('segments', JSON.stringify(currentSegments))
        // Only include audio file if a new one was uploaded
        if (audioChanged && fullAudio) {
          audioFormData.append('audio', fullAudio, 'original.wav')
        }
      }

      if (metadata || audioFormData) {
        await onSubmit(metadata || {}, audioFormData)
      } else {
        onCancel()
      }
    } else {
      // Create new personality
      if (!fullAudio || !name.trim() || !transcript.trim()) return

      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('description', description.trim())
      formData.append('language', language)
      formData.append('transcript', transcript.trim())
      formData.append('audio', fullAudio, 'original.wav')
      formData.append('segments', JSON.stringify(currentSegments))

      await onSubmit(formData)
    }
  }, [isEditing, name, description, language, transcript, audioBlob, segments, audioChanged, personality, onSubmit, onCancel])

  const isValid = isEditing
    ? name.trim() && (audioChanged ? (audioBlob && transcript.trim()) : true)
    : name.trim() && audioBlob && transcript.trim()

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isEditing ? 'Edit Personality' : 'Create Personality'}
            </h2>
            <p className="text-sm text-slate-400">
              {isEditing
                ? 'Update the personality settings and audio'
                : 'Set up a new voice personality for reuse'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="personality-name" className="block text-sm font-medium text-slate-300 mb-2">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="personality-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Narrator, Podcast Host, Character Name"
              className="input-field"
              maxLength={100}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="personality-description" className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              id="personality-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this voice (e.g., 'Deep male voice with slight accent')"
              rows={2}
              className="textarea-field"
              maxLength={500}
            />
          </div>

          {/* Language */}
          <div>
            <label htmlFor="personality-language" className="block text-sm font-medium text-slate-300 mb-2">
              Language
            </label>
            <select
              id="personality-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="select-field"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {/* Audio Editor */}
          <AudioEditor
            ref={audioEditorRef}
            audioUrl={isEditing && !audioChanged ? personality?.original_url || personality?.audio_url : undefined}
            initialSegments={isEditing && !audioChanged ? personality?.segments : undefined}
            onAudioChange={handleAudioChange}
            onSegmentsChange={setSegments}
            transcript={transcript}
            onTranscriptChange={setTranscript}
            onTranscribe={audioBlob || (isEditing && !audioChanged) ? handleTranscribe : undefined}
            isTranscribing={isTranscribing}
            label={isEditing ? 'Reference Audio (upload new to replace)' : 'Reference Audio *'}
          />

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isLoading}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {isEditing ? 'Save Changes' : 'Create Personality'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
