import { useCallback, useEffect, useState, useImperativeHandle, forwardRef } from 'react'
import { Upload, Play, Pause, Loader2, FileAudio, X, Wand2, ZoomIn, ZoomOut, Repeat, Square, SkipForward, Plus, Trash2, Layers, RotateCcw } from 'lucide-react'
import { PlayMode, Segment, useAudioEditor } from '../hooks/useAudioEditor'

export interface AudioEditorHandle {
  getFullAudio: () => Promise<Blob | null>
  getSelectedAudio: () => Promise<Blob | null>
  getSegments: () => Segment[]
  getGatheredAudio: () => Blob | null
}

interface AudioEditorProps {
  audioFile?: File | null
  audioUrl?: string
  onAudioChange: (blob: Blob | null) => void
  onSegmentsChange?: (segments: Segment[]) => void
  initialSegments?: Segment[]
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
  onSegmentsChange,
  initialSegments,
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
    segments,
    selectedSegmentIndex,
    totalSelectedDuration,
    isValidDuration,
    validationMessage,
    canAddSegment,
    loadAudio,
    addSegment,
    removeSegment,
    selectSegment,
    getSegments,
    getFullAudio,
    getSelectedAudio,
    playSelection,
    stopPlayback,
    zoom,
    zoomIn,
    zoomOut,
    playMode,
    setPlayMode,
    gatheredAudioBlob,
    gatheredAudioUrl,
    isGatheredStale,
    gatherSegments,
    clearGatheredAudio,
    canRevert,
    revertToOriginal,
  } = useAudioEditor({ minDuration, maxDuration })

  // Expose methods via ref for parent to get audio and segments
  useImperativeHandle(ref, () => ({
    getFullAudio,
    getSelectedAudio,
    getSegments,
    getGatheredAudio: () => gatheredAudioBlob,
  }), [getFullAudio, getSelectedAudio, getSegments, gatheredAudioBlob])

  // Load audio when file changes
  useEffect(() => {
    const source = audioFile || localFile || audioUrl
    if (source) {
      loadAudio(source, initialSegments)
    }
  }, [audioFile, localFile, audioUrl, loadAudio, initialSegments])

  // Notify parent when segments change
  useEffect(() => {
    if (isReady && onSegmentsChange && segments.length > 0) {
      onSegmentsChange(segments)
    }
  }, [segments, isReady, onSegmentsChange])

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          selectedSegmentIndex !== null &&
          segments.length > 1 &&
          // Don't delete if focus is on an input
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        removeSegment(selectedSegmentIndex)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSegmentIndex, segments.length, removeSegment])

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

  // Sort segments for display
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start)

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
              type="button"
              onClick={handleRemove}
              aria-label="Remove audio"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Waveform */}
          <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
            <div ref={waveformRef} className="mb-3" role="img" aria-label="Audio waveform editor" />

            {isReady && (
              <>
                {/* Segments info */}
                <div className="flex items-center justify-between text-sm mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      {segments.length} segment{segments.length !== 1 ? 's' : ''}
                    </span>
                    {selectedSegmentIndex !== null && (
                      <span className="text-primary-400">
                        (#{selectedSegmentIndex + 1} selected)
                      </span>
                    )}
                  </div>
                  <span className={`font-medium ${isValidDuration ? 'text-green-400' : 'text-amber-400'}`}>
                    Total: {totalSelectedDuration.toFixed(1)}s
                  </span>
                </div>

                {/* Segment list */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {sortedSegments.map((seg, idx) => (
                    <button
                      key={`${seg.start}-${seg.end}`}
                      type="button"
                      onClick={() => selectSegment(idx === selectedSegmentIndex ? null : idx)}
                      className={`
                        px-2 py-1 rounded text-xs transition-colors
                        ${idx === selectedSegmentIndex
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }
                      `}
                    >
                      {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                      <span className="ml-1 text-slate-400">
                        ({(seg.end - seg.start).toFixed(1)}s)
                      </span>
                    </button>
                  ))}
                </div>

                {/* Validation message */}
                {validationMessage && (
                  <p className="text-xs text-amber-400 mb-3">{validationMessage}</p>
                )}

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-2">
                    {/* Play/Stop button */}
                    <button
                      type="button"
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

                    {/* Play mode toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        const modes: PlayMode[] = ['selection', 'loop', 'continue']
                        const currentIndex = modes.indexOf(playMode)
                        setPlayMode(modes[(currentIndex + 1) % modes.length])
                      }}
                      className="btn-secondary flex items-center gap-2"
                      aria-label={`Play mode: ${playMode === 'selection' ? 'Once' : playMode === 'loop' ? 'Loop' : 'Continue'}. Click to change.`}
                      title={
                        playMode === 'selection' ? 'Switch to: Loop' :
                        playMode === 'loop' ? 'Switch to: Continue after selection' :
                        'Switch to: Once (stop after selection)'
                      }
                    >
                      {playMode === 'loop' ? (
                        <Repeat className="w-4 h-4" />
                      ) : playMode === 'continue' ? (
                        <SkipForward className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      <span className="text-xs">
                        {playMode === 'selection' ? 'Once' : playMode === 'loop' ? 'Loop' : 'Continue'}
                      </span>
                    </button>

                    {/* Add segment button */}
                    <button
                      type="button"
                      onClick={addSegment}
                      disabled={!canAddSegment}
                      className="btn-secondary flex items-center gap-1"
                      aria-label="Add segment"
                      title={canAddSegment ? 'Add another segment' : 'Maximum 5 segments'}
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-xs">Add</span>
                    </button>

                    {/* Delete segment button */}
                    {selectedSegmentIndex !== null && segments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSegment(selectedSegmentIndex)}
                        className="btn-secondary flex items-center gap-1 text-red-400 hover:text-red-300"
                        aria-label="Delete selected segment"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-xs">Delete</span>
                      </button>
                    )}

                    {/* Gather segments button */}
                    <button
                      type="button"
                      onClick={gatherSegments}
                      disabled={segments.length === 0}
                      className="btn-secondary flex items-center gap-1"
                      aria-label="Gather audio segments"
                      title="Combine segments into a single audio preview for transcription"
                    >
                      <Layers className="w-4 h-4" />
                      <span className="text-xs">Gather</span>
                    </button>

                    {/* Revert to original button */}
                    {canRevert && (
                      <button
                        type="button"
                        onClick={revertToOriginal}
                        className="btn-secondary flex items-center gap-1 text-amber-400 hover:text-amber-300"
                        aria-label="Revert to original segments"
                        title="Restore original segment positions"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span className="text-xs">Revert</span>
                      </button>
                    )}
                  </div>

                  {/* Zoom controls */}
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={zoomOut}
                      disabled={zoom <= 1}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Zoom out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-500 min-w-[3rem] text-center">
                      {zoom <= 1 ? '1x' : `${zoom.toFixed(0)}x`}
                    </span>
                    <button
                      type="button"
                      onClick={zoomIn}
                      disabled={zoom >= 500}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Zoom in"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mt-3">
                  Drag segment edges to adjust. Click segment to select, then Delete key to remove.
                </p>
              </>
            )}
          </div>

          {/* Gathered audio preview */}
          {gatheredAudioUrl && (
            <div className={`p-4 rounded-lg border ${
              isGatheredStale
                ? 'bg-amber-500/5 border-amber-500/60'
                : 'bg-slate-800/50 border-slate-600'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Layers className={`w-4 h-4 ${isGatheredStale ? 'text-amber-400' : 'text-primary-400'}`} />
                  <span className="text-sm font-medium text-slate-300">Gathered Audio</span>
                  {isGatheredStale ? (
                    <span className="text-xs text-amber-400 font-medium">
                      Segments changed — re-gather to update
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">(used for transcription & cloning)</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearGatheredAudio}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  aria-label="Clear gathered audio"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <audio src={gatheredAudioUrl} controls className="w-full" />
            </div>
          )}

          {/* Transcript */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor={`${inputId}-transcript`} className="block text-sm font-medium text-slate-300">
                Transcript
              </label>
              {onTranscribe && (
                <button
                  type="button"
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
              placeholder="Enter the exact words spoken in the selected segments..."
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
                WAV, MP3, OGG · Total selection: {minDuration}-{maxDuration} seconds
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
