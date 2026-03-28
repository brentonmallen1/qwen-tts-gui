import { useCallback, useEffect, useState, useImperativeHandle, forwardRef } from 'react'
import { Upload, Play, Pause, Loader2, FileAudio, X, Wand2 } from 'lucide-react'
import { useAudioEditor } from '../hooks/useAudioEditor'

export interface AudioSelection {
  start: number
  end: number
}

export interface AudioEditorHandle {
  getSelectedAudio: () => Promise<Blob | null>
  getSelection: () => AudioSelection
}

interface AudioEditorProps {
  audioFile?: File | null
  audioUrl?: string
  onAudioChange: (blob: Blob | null) => void
  onSelectionChange?: (selection: AudioSelection) => void
  initialSelection?: AudioSelection
  transcript: string
  onTranscriptChange: (text: string) => void
  onTranscribe?: () => Promise<void>
  isTranscribing?: boolean
  minDuration?: number
  maxDuration?: number
  label?: string
}

export const AudioEditor = forwardRef<AudioEditorHandle, AudioEditorProps>(function AudioEditor({
  audioFile,
  audioUrl,
  onAudioChange,
  onSelectionChange,
  transcript,
  onTranscriptChange,
  onTranscribe,
  isTranscribing = false,
  minDuration = 3,
  maxDuration = 20,
  label = 'Reference Audio',
}, ref) {
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const {
    waveformRef,
    isReady,
    isPlaying,
    duration,
    regionStart,
    regionEnd,
    selectedDuration,
    isValidDuration,
    validationMessage,
    loadAudio,
    playSelection,
    stopPlayback,
    getTrimmedAudio,
  } = useAudioEditor({ minDuration, maxDuration })

  // Expose methods via ref for parent to get selected audio
  useImperativeHandle(ref, () => ({
    getSelectedAudio: getTrimmedAudio,
    getSelection: () => ({ start: regionStart, end: regionEnd }),
  }), [getTrimmedAudio, regionStart, regionEnd])

  // Load audio when file changes
  useEffect(() => {
    const source = audioFile || localFile || audioUrl
    if (source) {
      loadAudio(source)
    }
  }, [audioFile, localFile, audioUrl, loadAudio])

  // Notify parent when selection changes
  useEffect(() => {
    if (isReady && onSelectionChange) {
      onSelectionChange({ start: regionStart, end: regionEnd })
    }
  }, [regionStart, regionEnd, isReady, onSelectionChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith('audio/')) {
      setLocalFile(droppedFile)
      onAudioChange(droppedFile)
    }
  }, [onAudioChange])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setLocalFile(selectedFile)
      onAudioChange(selectedFile)
    }
  }, [onAudioChange])

  const handleRemove = useCallback(() => {
    setLocalFile(null)
    onAudioChange(null)
    onTranscriptChange('')
  }, [onAudioChange, onTranscriptChange])

  const hasAudio = audioFile || localFile || audioUrl
  const inputId = `audio-editor-${label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-slate-300">{label}</label>

      {hasAudio ? (
        <div className="space-y-4">
          {/* File info header */}
          <div className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-lg">
            <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
              <FileAudio className="w-5 h-5 text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {localFile?.name || audioFile?.name || 'Audio file'}
              </p>
              <p className="text-xs text-slate-400">
                Duration: {duration.toFixed(1)}s
              </p>
            </div>
            <button
              onClick={handleRemove}
              aria-label="Remove audio"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Waveform */}
          <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
            <div ref={waveformRef} className="mb-3" />

            {isReady && (
              <>
                {/* Selection info */}
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-slate-400">
                    Selection: {regionStart.toFixed(1)}s - {regionEnd.toFixed(1)}s
                  </span>
                  <span className={`font-medium ${isValidDuration ? 'text-green-400' : 'text-amber-400'}`}>
                    {selectedDuration.toFixed(1)}s
                  </span>
                </div>

                {/* Validation message */}
                {validationMessage && (
                  <p className="text-xs text-amber-400 mb-3">{validationMessage}</p>
                )}

                {/* Controls */}
                <div className="flex gap-2">
                  <button
                    onClick={isPlaying ? stopPlayback : playSelection}
                    className="btn-secondary flex items-center gap-2"
                    aria-label={isPlaying ? 'Stop playback' : 'Play selection'}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Preview
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-500 mt-3">
                  Drag the edges of the selection to adjust what will be used
                </p>
              </>
            )}
          </div>

          {/* Transcript */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor={`${inputId}-transcript`} className="block text-sm font-medium text-slate-300">
                Transcript
              </label>
              {onTranscribe && (
                <button
                  onClick={onTranscribe}
                  disabled={isTranscribing || !isReady}
                  className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Transcribing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Auto-Transcribe
                    </>
                  )}
                </button>
              )}
            </div>
            <textarea
              id={`${inputId}-transcript`}
              value={transcript}
              onChange={(e) => onTranscriptChange(e.target.value)}
              placeholder="Enter the exact words spoken in the audio..."
              rows={3}
              className="textarea-field"
              maxLength={2000}
            />
            <p className="text-xs text-slate-500 mt-1">
              Accurate transcripts improve voice cloning quality
            </p>
          </div>
        </div>
      ) : (
        /* Upload area */
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`
            relative border-2 border-dashed rounded-lg p-8
            transition-all duration-200 cursor-pointer
            ${isDragging
              ? 'border-primary-500 bg-primary-500/10'
              : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
            }
          `}
        >
          <input
            id={inputId}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center">
              <Upload className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">
                Drop audio file here or click to upload
              </p>
              <p className="text-xs text-slate-500 mt-1">
                WAV, MP3, OGG · {minDuration}-{maxDuration} seconds
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
