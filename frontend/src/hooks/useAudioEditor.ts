import { useState, useCallback, useRef, useEffect } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions.js'

export type PlayMode = 'selection' | 'loop' | 'continue'

export interface Segment {
  start: number
  end: number
}

interface UseAudioEditorOptions {
  minDuration?: number
  maxDuration?: number
  maxSegments?: number
  initialSegments?: Segment[]
}

interface UseAudioEditorReturn {
  waveformRef: (el: HTMLDivElement | null) => void
  isReady: boolean
  isPlaying: boolean
  duration: number
  // Multi-segment support
  segments: Segment[]
  selectedSegmentIndex: number | null
  totalSelectedDuration: number
  isValidDuration: boolean
  validationMessage: string
  canAddSegment: boolean
  hasOverlap: boolean
  // Actions
  loadAudio: (file: File | Blob | string, initialSegments?: Segment[]) => Promise<void>
  addSegment: () => void
  removeSegment: (index: number) => void
  selectSegment: (index: number | null) => void
  getSegments: () => Segment[]
  getOriginalFile: () => File | null
  getFullAudio: () => Promise<Blob | null>
  getSelectedAudio: () => Promise<Blob | null>
  playSelection: () => void
  stopPlayback: () => void
  destroy: () => void
  // Zoom controls
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  // Play mode
  playMode: PlayMode
  setPlayMode: (mode: PlayMode) => void
  // Gathered audio
  gatheredAudioBlob: Blob | null
  gatheredAudioUrl: string | null
  isGatheredStale: boolean
  gatherSegments: () => Promise<void>
  clearGatheredAudio: () => void
  // Revert to original
  canRevert: boolean
  revertToOriginal: () => void
}

// Generate unique colors for segments
const SEGMENT_COLORS = [
  'rgba(59, 130, 246, 0.3)',   // blue
  'rgba(34, 197, 94, 0.3)',    // green
  'rgba(168, 85, 247, 0.3)',   // purple
  'rgba(249, 115, 22, 0.3)',   // orange
  'rgba(236, 72, 153, 0.3)',   // pink
]

export function useAudioEditor(options: UseAudioEditorOptions = {}): UseAudioEditorReturn {
  const { minDuration = 3, maxDuration = 20, maxSegments = 5 } = options

  const [waveformContainer, setWaveformContainer] = useState<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const regionsMapRef = useRef<Map<string, Region>>(new Map())
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const optimalSegmentRef = useRef<{ start: number; end: number } | null>(null)
  const originalFileRef = useRef<File | null>(null)
  const pendingSourceRef = useRef<{ source: File | Blob | string; segments?: Segment[] } | null>(null)
  const playModeRef = useRef<PlayMode>('continue')

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [segments, setSegments] = useState<Segment[]>([])
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [playMode, setPlayModeState] = useState<PlayMode>('continue')
  const [originalSegments, setOriginalSegments] = useState<Segment[] | null>(null)
  const [gatheredAudioBlob, setGatheredAudioBlob] = useState<Blob | null>(null)
  const [gatheredAudioUrl, setGatheredAudioUrl] = useState<string | null>(null)
  const [gatheredSegments, setGatheredSegments] = useState<Segment[] | null>(null)

  // Keep ref in sync with state for event handlers
  const setPlayMode = useCallback((mode: PlayMode) => {
    playModeRef.current = mode
    setPlayModeState(mode)
  }, [])

  // Calculate total duration of all segments
  const totalSelectedDuration = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0)

  // Check for overlapping segments
  const hasOverlap = useCallback(() => {
    const sorted = [...segments].sort((a, b) => a.start - b.start)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].end > sorted[i + 1].start) {
        return true
      }
    }
    return false
  }, [segments])

  const isValidDuration = totalSelectedDuration >= minDuration && totalSelectedDuration <= maxDuration && !hasOverlap()
  const canAddSegment = segments.length < maxSegments

  const validationMessage = hasOverlap()
    ? 'Segments cannot overlap'
    : totalSelectedDuration < minDuration
      ? `Total duration must be at least ${minDuration}s (currently ${totalSelectedDuration.toFixed(1)}s)`
      : totalSelectedDuration > maxDuration
        ? `Total duration must be at most ${maxDuration}s (currently ${totalSelectedDuration.toFixed(1)}s)`
        : ''

  // Sync regions to state
  const syncRegionsToState = useCallback(() => {
    const newSegments: Segment[] = []
    regionsMapRef.current.forEach((region) => {
      newSegments.push({ start: region.start, end: region.end })
    })
    // Sort by start time
    newSegments.sort((a, b) => a.start - b.start)
    setSegments(newSegments)
  }, [])

  // Create a region in the waveform
  const createRegion = useCallback((start: number, end: number, index: number): Region | null => {
    if (!regionsRef.current) return null

    const region = regionsRef.current.addRegion({
      start,
      end,
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
      drag: true,
      resize: true,
    })

    // Make regions occupy top 60% so bottom 40% is clickable for play head positioning
    if (region.element) {
      region.element.style.height = '60%'
      region.element.style.top = '0'
    }

    regionsMapRef.current.set(region.id, region)
    return region
  }, [])

  // Initialize WaveSurfer when container becomes available
  useEffect(() => {
    if (!waveformContainer) return

    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: waveformContainer,
      waveColor: '#64748b',
      progressColor: '#3b82f6',
      cursorColor: '#f8fafc',
      height: 100,
      normalize: true,
      plugins: [regions],
    })

    wavesurferRef.current = ws

    // Load any pending audio source
    if (pendingSourceRef.current) {
      const { source, segments: initSegs } = pendingSourceRef.current
      pendingSourceRef.current = null
      if (typeof source === 'string') {
        ws.load(source)
        fetch(source).then(r => r.arrayBuffer()).then(arrayBuffer => {
          const ctx = new AudioContext()
          audioContextRef.current = ctx
          ctx.decodeAudioData(arrayBuffer).then(buffer => {
            audioBufferRef.current = buffer
            if (!initSegs) {
              optimalSegmentRef.current = findOptimalSegment(buffer, maxDuration)
            }
          })
        }).catch(() => {})
      } else {
        const url = URL.createObjectURL(source)
        ws.load(url)
        source.arrayBuffer().then(arrayBuffer => {
          const ctx = new AudioContext()
          audioContextRef.current = ctx
          ctx.decodeAudioData(arrayBuffer).then(buffer => {
            audioBufferRef.current = buffer
            if (!initSegs) {
              optimalSegmentRef.current = findOptimalSegment(buffer, maxDuration)
            }
          })
        })
      }
      // Store initial segments to create after ready
      if (initSegs) {
        pendingSourceRef.current = { source: '', segments: initSegs }
      }
    }

    ws.on('ready', () => {
      const dur = ws.getDuration()
      setDuration(dur)

      // Check for pending initial segments
      const initSegs = pendingSourceRef.current?.segments
      pendingSourceRef.current = null

      if (initSegs && initSegs.length > 0) {
        // Store original segments for revert functionality
        setOriginalSegments([...initSegs])
        // Create regions from initial segments
        initSegs.forEach((seg, i) => {
          createRegion(seg.start, Math.min(seg.end, dur), i)
        })
      } else {
        // Use optimal segment if available, otherwise default to start
        const optimal = optimalSegmentRef.current
        const start = optimal?.start ?? 0
        const end = optimal?.end ?? Math.min(dur, maxDuration)
        optimalSegmentRef.current = null
        createRegion(start, end, 0)
      }

      syncRegionsToState()
      setIsReady(true)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))

    // Handle region updates
    regions.on('region-updated', () => {
      syncRegionsToState()
    })

    // Handle region click for selection
    regions.on('region-clicked', (region: Region, e: MouseEvent) => {
      e.stopPropagation()
      // Find index of this region
      const sortedRegions = Array.from(regionsMapRef.current.values())
        .sort((a, b) => a.start - b.start)
      const index = sortedRegions.findIndex(r => r.id === region.id)
      setSelectedSegmentIndex(index)
    })

    // Handle loop mode
    regions.on('region-out', (region: Region) => {
      if (playModeRef.current === 'loop' && wavesurferRef.current?.isPlaying()) {
        region.play()
      }
    })

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
      regionsMapRef.current.clear()
    }
  }, [waveformContainer, maxDuration, createRegion, syncRegionsToState])

  const loadAudio = useCallback(async (source: File | Blob | string, initSegments?: Segment[]) => {
    // Track the original file (only File objects, not Blobs or URLs)
    originalFileRef.current = source instanceof File ? source : null

    // If WaveSurfer isn't ready yet, store the source to load later
    if (!wavesurferRef.current) {
      pendingSourceRef.current = { source, segments: initSegments }
      return
    }

    pendingSourceRef.current = null
    setIsReady(false)
    setSegments([])
    setSelectedSegmentIndex(null)
    setOriginalSegments(null)
    regionsMapRef.current.clear()

    // Clear existing regions
    if (regionsRef.current) {
      regionsRef.current.clearRegions()
    }

    // Store initial segments for after load
    if (initSegments) {
      pendingSourceRef.current = { source: '', segments: initSegments }
    }

    if (typeof source === 'string') {
      await wavesurferRef.current.load(source)
      // Also fetch and decode audio buffer so getSelectedAudio/gatherSegments work for URL sources
      try {
        const response = await fetch(source)
        const arrayBuffer = await response.arrayBuffer()
        audioContextRef.current = new AudioContext()
        audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer)
        if (!initSegments) {
          optimalSegmentRef.current = findOptimalSegment(audioBufferRef.current, maxDuration)
        }
      } catch (err) {
        console.warn('Could not decode audio buffer from URL:', err)
      }
    } else {
      const url = URL.createObjectURL(source)
      await wavesurferRef.current.load(url)

      // Store the audio buffer for trimming
      const arrayBuffer = await source.arrayBuffer()
      audioContextRef.current = new AudioContext()
      audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer)
      if (!initSegments) {
        optimalSegmentRef.current = findOptimalSegment(audioBufferRef.current, maxDuration)
      }
    }
  }, [maxDuration])

  const addSegment = useCallback(() => {
    if (!regionsRef.current || !wavesurferRef.current || !isReady || segments.length >= maxSegments) return

    const segmentLength = 2 // 2 second default
    const currentTime = wavesurferRef.current.getCurrentTime()

    // Center segment on playhead, clamped to audio bounds
    let newStart = Math.max(0, currentTime - segmentLength / 2)
    let newEnd = Math.min(duration, newStart + segmentLength)
    // Shift start back if we hit the end
    if (newEnd - newStart < segmentLength) {
      newStart = Math.max(0, newEnd - segmentLength)
    }

    // If it would overlap an existing segment, fall back to finding a gap
    const sorted = [...segments].sort((a, b) => a.start - b.start)
    const wouldOverlap = sorted.some(seg => !(newEnd <= seg.start || newStart >= seg.end))

    if (wouldOverlap) {
      // Find first available gap
      for (let i = 0; i <= sorted.length; i++) {
        const gapStart = i === 0 ? 0 : sorted[i - 1].end
        const gapEnd = i === sorted.length ? duration : sorted[i].start
        if (gapEnd - gapStart >= 1) {
          newStart = gapStart
          newEnd = Math.min(gapStart + segmentLength, gapEnd)
          break
        }
        if (i === sorted.length) return // no space
      }
    }

    createRegion(newStart, newEnd, segments.length)
    syncRegionsToState()
  }, [segments, duration, maxSegments, isReady, createRegion, syncRegionsToState])

  const removeSegment = useCallback((index: number) => {
    if (segments.length <= 1) return // Keep at least one segment

    const sorted = [...segments].sort((a, b) => a.start - b.start)
    const segToRemove = sorted[index]

    // Find and remove the matching region
    regionsMapRef.current.forEach((region, id) => {
      if (Math.abs(region.start - segToRemove.start) < 0.01 &&
          Math.abs(region.end - segToRemove.end) < 0.01) {
        region.remove()
        regionsMapRef.current.delete(id)
      }
    })

    syncRegionsToState()
    setSelectedSegmentIndex(null)
  }, [segments, syncRegionsToState])

  const selectSegment = useCallback((index: number | null) => {
    setSelectedSegmentIndex(index)
  }, [])

  const getSegments = useCallback((): Segment[] => {
    return [...segments].sort((a, b) => a.start - b.start)
  }, [segments])

  const getOriginalFile = useCallback((): File | null => {
    return originalFileRef.current
  }, [])

  const getFullAudio = useCallback(async (): Promise<Blob | null> => {
    if (!audioBufferRef.current || !audioContextRef.current) {
      return null
    }
    // Return the full audio buffer as WAV
    const wavBlob = audioBufferToWav(audioBufferRef.current)
    return wavBlob
  }, [])

  const getSelectedAudio = useCallback(async (): Promise<Blob | null> => {
    if (!audioBufferRef.current || segments.length === 0) {
      return null
    }

    const buffer = audioBufferRef.current
    const sampleRate = buffer.sampleRate
    const numberOfChannels = buffer.numberOfChannels

    // Sort segments by start time
    const sortedSegments = [...segments].sort((a, b) => a.start - b.start)

    // Calculate total frames needed
    let totalFrames = 0
    for (const seg of sortedSegments) {
      const startFrame = Math.floor(seg.start * sampleRate)
      const endFrame = Math.floor(seg.end * sampleRate)
      totalFrames += endFrame - startFrame
    }

    // Create a new AudioContext for the offline rendering
    const offlineCtx = new OfflineAudioContext(numberOfChannels, totalFrames, sampleRate)
    const newBuffer = offlineCtx.createBuffer(numberOfChannels, totalFrames, sampleRate)

    // 25ms fade in/out at segment boundaries to avoid pops/clicks
    const fadeSamples = Math.floor(sampleRate * 0.025)

    // Copy segment data into new buffer with crossfades
    let destOffset = 0
    for (let segIdx = 0; segIdx < sortedSegments.length; segIdx++) {
      const seg = sortedSegments[segIdx]
      const startFrame = Math.floor(seg.start * sampleRate)
      const endFrame = Math.floor(seg.end * sampleRate)
      const frameCount = endFrame - startFrame
      const isFirst = segIdx === 0
      const isLast = segIdx === sortedSegments.length - 1

      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sourceData = buffer.getChannelData(channel)
        const destData = newBuffer.getChannelData(channel)
        for (let i = 0; i < frameCount; i++) {
          let sample = sourceData[startFrame + i]
          // Fade in at start of each segment (except the first)
          if (!isFirst && i < fadeSamples) {
            sample *= i / fadeSamples
          }
          // Fade out at end of each segment (except the last)
          if (!isLast && i >= frameCount - fadeSamples) {
            sample *= (frameCount - i) / fadeSamples
          }
          destData[destOffset + i] = sample
        }
      }
      destOffset += frameCount
    }

    // Convert to WAV
    return audioBufferToWav(newBuffer)
  }, [segments])

  const revertToOriginal = useCallback(() => {
    if (!originalSegments || !regionsRef.current || !isReady) return

    regionsRef.current.clearRegions()
    regionsMapRef.current.clear()

    originalSegments.forEach((seg, i) => {
      createRegion(seg.start, Math.min(seg.end, duration), i)
    })

    syncRegionsToState()
    setSelectedSegmentIndex(null)
  }, [originalSegments, isReady, duration, createRegion, syncRegionsToState])

  const gatherSegments = useCallback(async () => {
    const selected = await getSelectedAudio()
    if (selected) {
      if (gatheredAudioUrl) {
        URL.revokeObjectURL(gatheredAudioUrl)
      }
      const url = URL.createObjectURL(selected)
      setGatheredAudioBlob(selected)
      setGatheredAudioUrl(url)
      setGatheredSegments([...segments].sort((a, b) => a.start - b.start))
    }
  }, [getSelectedAudio, gatheredAudioUrl, segments])

  const clearGatheredAudio = useCallback(() => {
    if (gatheredAudioUrl) {
      URL.revokeObjectURL(gatheredAudioUrl)
    }
    setGatheredAudioBlob(null)
    setGatheredAudioUrl(null)
  }, [gatheredAudioUrl])

  const playSelection = useCallback(() => {
    if (!wavesurferRef.current || segments.length === 0) return

    const ws = wavesurferRef.current
    const sorted = [...segments].sort((a, b) => a.start - b.start)

    // Play the selected segment, or first segment
    const segIndex = selectedSegmentIndex ?? 0
    const seg = sorted[segIndex]

    // Find the matching region
    let targetRegion: Region | undefined
    for (const region of regionsMapRef.current.values()) {
      if (Math.abs(region.start - seg.start) < 0.01 &&
          Math.abs(region.end - seg.end) < 0.01) {
        targetRegion = region
        break
      }
    }

    if (targetRegion) {
      const mode = playModeRef.current
      if (mode === 'continue') {
        ws.setTime(targetRegion.start)
        ws.play()
      } else if (mode === 'selection') {
        targetRegion.play(true)  // stopAtEnd=true: stop after playing once
      } else {
        targetRegion.play(false) // loop mode: region-out event handles replay
      }
    }
  }, [segments, selectedSegmentIndex])

  const stopPlayback = useCallback(() => {
    if (!wavesurferRef.current) return
    wavesurferRef.current.pause()
  }, [])

  const zoomIn = useCallback(() => {
    if (!wavesurferRef.current) return
    const newZoom = Math.min(zoom * 1.5, 500)
    setZoom(newZoom)
    wavesurferRef.current.zoom(newZoom)
  }, [zoom])

  const zoomOut = useCallback(() => {
    if (!wavesurferRef.current) return
    const newZoom = Math.max(zoom / 1.5, 1)
    setZoom(newZoom)
    wavesurferRef.current.zoom(newZoom)
  }, [zoom])

  const destroy = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy()
      wavesurferRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    audioBufferRef.current = null
    regionsMapRef.current.clear()
    setIsReady(false)
    setDuration(0)
    setSegments([])
    setSelectedSegmentIndex(null)
  }, [])

  const isGatheredStale = gatheredSegments !== null &&
    JSON.stringify([...segments].sort((a, b) => a.start - b.start)) !==
    JSON.stringify(gatheredSegments)

  const segmentsMatchOriginal = originalSegments !== null &&
    JSON.stringify([...segments].sort((a, b) => a.start - b.start)) ===
    JSON.stringify([...originalSegments].sort((a, b) => a.start - b.start))
  const canRevert = originalSegments !== null && !segmentsMatchOriginal

  return {
    waveformRef: setWaveformContainer,
    isReady,
    isPlaying,
    duration,
    segments,
    selectedSegmentIndex,
    totalSelectedDuration,
    isValidDuration,
    validationMessage,
    canAddSegment,
    hasOverlap: hasOverlap(),
    loadAudio,
    addSegment,
    removeSegment,
    selectSegment,
    getSegments,
    getOriginalFile,
    getFullAudio,
    getSelectedAudio,
    playSelection,
    stopPlayback,
    destroy,
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
  }
}

// Find the best contiguous window in an AudioBuffer for voice cloning.
// Scores candidate windows by RMS energy (prefer speech) penalized by
// standard deviation (prefer consistent speech over bursts + silence).
function findOptimalSegment(
  audioBuffer: AudioBuffer,
  targetDuration: number = 20,
  analysisWindowMs: number = 100
): { start: number; end: number } {
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration

  if (duration <= targetDuration) {
    return { start: 0, end: duration }
  }

  // Mix all channels to mono for analysis
  const numChannels = audioBuffer.numberOfChannels
  const totalSamples = audioBuffer.length
  const samples = new Float32Array(totalSamples)
  for (let ch = 0; ch < numChannels; ch++) {
    const chData = audioBuffer.getChannelData(ch)
    for (let i = 0; i < totalSamples; i++) {
      samples[i] += chData[i] / numChannels
    }
  }

  // Compute RMS energy for each analysis window
  const windowSamples = Math.floor(analysisWindowMs / 1000 * sampleRate)
  const numWindows = Math.floor(totalSamples / windowSamples)
  const rmsValues = new Float32Array(numWindows)
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSamples
    let sumSq = 0
    for (let i = start; i < start + windowSamples; i++) {
      sumSq += samples[i] * samples[i]
    }
    rmsValues[w] = Math.sqrt(sumSq / windowSamples)
  }

  // Slide a window of targetDuration across the audio and score each position.
  // Score = mean RMS / (1 + stdDev): rewards consistent high-energy speech.
  const windowsPerSegment = Math.floor(targetDuration / (analysisWindowMs / 1000))
  let bestScore = -1
  let bestStartWindow = 0

  for (let startW = 0; startW <= numWindows - windowsPerSegment; startW++) {
    let sum = 0
    for (let i = startW; i < startW + windowsPerSegment; i++) {
      sum += rmsValues[i]
    }
    const mean = sum / windowsPerSegment

    let varSum = 0
    for (let i = startW; i < startW + windowsPerSegment; i++) {
      varSum += (rmsValues[i] - mean) ** 2
    }
    const stdDev = Math.sqrt(varSum / windowsPerSegment)

    const score = mean / (1 + stdDev)
    if (score > bestScore) {
      bestScore = score
      bestStartWindow = startW
    }
  }

  const startTime = bestStartWindow * (analysisWindowMs / 1000)
  return { start: startTime, end: Math.min(startTime + targetDuration, duration) }
}

// Helper function to convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  const bytesPerSample = bitDepth / 8
  const blockAlign = numberOfChannels * bytesPerSample

  const dataLength = buffer.length * blockAlign
  const bufferLength = 44 + dataLength

  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, format, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  // Write interleaved samples
  let offset = 44
  const channels: Float32Array[] = []
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}
