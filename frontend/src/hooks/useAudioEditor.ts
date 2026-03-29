import { useState, useCallback, useRef, useEffect } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { Region } from 'wavesurfer.js/dist/plugins/regions.js'

export type PlayMode = 'selection' | 'loop' | 'continue'

interface UseAudioEditorOptions {
  minDuration?: number
  maxDuration?: number
}

interface UseAudioEditorReturn {
  waveformRef: (el: HTMLDivElement | null) => void
  isReady: boolean
  isPlaying: boolean
  duration: number
  regionStart: number
  regionEnd: number
  selectedDuration: number
  isValidDuration: boolean
  validationMessage: string
  loadAudio: (file: File | Blob | string) => Promise<void>
  playSelection: () => void
  stopPlayback: () => void
  setRegion: (start: number, end: number) => void
  getTrimmedAudio: () => Promise<Blob | null>
  destroy: () => void
  // Zoom controls
  zoom: number
  zoomIn: () => void
  zoomOut: () => void
  // Play mode
  playMode: PlayMode
  setPlayMode: (mode: PlayMode) => void
}

export function useAudioEditor(options: UseAudioEditorOptions = {}): UseAudioEditorReturn {
  const { minDuration = 3, maxDuration = 20 } = options

  const [waveformContainer, setWaveformContainer] = useState<HTMLDivElement | null>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<RegionsPlugin | null>(null)
  const activeRegionRef = useRef<Region | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const pendingSourceRef = useRef<File | Blob | string | null>(null)
  const playModeRef = useRef<PlayMode>('selection')

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [regionStart, setRegionStart] = useState(0)
  const [regionEnd, setRegionEnd] = useState(0)
  const [zoom, setZoom] = useState(1) // pixels per second, 1 = default
  const [playMode, setPlayModeState] = useState<PlayMode>('selection')

  // Keep ref in sync with state for event handlers
  const setPlayMode = useCallback((mode: PlayMode) => {
    playModeRef.current = mode
    setPlayModeState(mode)
  }, [])

  const selectedDuration = regionEnd - regionStart

  const isValidDuration = selectedDuration >= minDuration && selectedDuration <= maxDuration

  const validationMessage = !isValidDuration
    ? selectedDuration < minDuration
      ? `Selection must be at least ${minDuration}s (currently ${selectedDuration.toFixed(1)}s)`
      : `Selection must be at most ${maxDuration}s (currently ${selectedDuration.toFixed(1)}s)`
    : ''

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
      const source = pendingSourceRef.current
      pendingSourceRef.current = null
      if (typeof source === 'string') {
        ws.load(source)
      } else {
        const url = URL.createObjectURL(source)
        ws.load(url)
        // Store the audio buffer for trimming
        source.arrayBuffer().then(arrayBuffer => {
          const ctx = new AudioContext()
          audioContextRef.current = ctx
          ctx.decodeAudioData(arrayBuffer).then(buffer => {
            audioBufferRef.current = buffer
          })
        })
      }
    }

    ws.on('ready', () => {
      const dur = ws.getDuration()
      setDuration(dur)

      // Create initial region spanning valid duration
      const end = Math.min(dur, maxDuration)
      const start = 0

      const region = regions.addRegion({
        start,
        end,
        color: 'rgba(59, 130, 246, 0.3)',
        drag: true,
        resize: true,
      })

      activeRegionRef.current = region
      setRegionStart(start)
      setRegionEnd(end)
      setIsReady(true)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))

    // Handle region updates
    regions.on('region-updated', (region: Region) => {
      setRegionStart(region.start)
      setRegionEnd(region.end)
    })

    // Handle loop mode - replay when region ends
    regions.on('region-out', (region: Region) => {
      if (playModeRef.current === 'loop' && region === activeRegionRef.current) {
        region.play()
      }
    })

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
      activeRegionRef.current = null
    }
  }, [waveformContainer, maxDuration])

  const loadAudio = useCallback(async (source: File | Blob | string) => {
    // If WaveSurfer isn't ready yet, store the source to load later
    if (!wavesurferRef.current) {
      pendingSourceRef.current = source
      return
    }

    pendingSourceRef.current = null
    setIsReady(false)

    // Clear existing regions
    if (regionsRef.current) {
      regionsRef.current.clearRegions()
    }

    if (typeof source === 'string') {
      await wavesurferRef.current.load(source)
    } else {
      const url = URL.createObjectURL(source)
      await wavesurferRef.current.load(url)

      // Store the audio buffer for trimming
      const arrayBuffer = await source.arrayBuffer()
      audioContextRef.current = new AudioContext()
      audioBufferRef.current = await audioContextRef.current.decodeAudioData(arrayBuffer)
    }
  }, [])

  const playSelection = useCallback(() => {
    if (!wavesurferRef.current || !activeRegionRef.current) return

    const ws = wavesurferRef.current
    const region = activeRegionRef.current
    const mode = playModeRef.current

    if (mode === 'loop') {
      // Play region and loop - region-out handler will restart
      region.play()
    } else if (mode === 'continue') {
      // Play from region start and continue past region end
      ws.setTime(region.start)
      ws.play()
    } else {
      // Default: play selection only, stop at end
      region.play()
    }
  }, [])

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

  const setRegion = useCallback((start: number, end: number) => {
    if (!activeRegionRef.current) return
    activeRegionRef.current.setOptions({ start, end })
    setRegionStart(start)
    setRegionEnd(end)
  }, [])

  const getTrimmedAudio = useCallback(async (): Promise<Blob | null> => {
    if (!audioBufferRef.current || !audioContextRef.current) {
      // If we don't have the buffer, try to get it from wavesurfer
      if (!wavesurferRef.current) return null

      // Fallback: return null if we can't trim client-side
      return null
    }

    const sampleRate = audioBufferRef.current.sampleRate
    const numberOfChannels = audioBufferRef.current.numberOfChannels
    const startSample = Math.floor(regionStart * sampleRate)
    const endSample = Math.floor(regionEnd * sampleRate)
    const trimmedLength = endSample - startSample

    // Create a new buffer for the trimmed audio
    const trimmedBuffer = audioContextRef.current.createBuffer(
      numberOfChannels,
      trimmedLength,
      sampleRate
    )

    // Copy the trimmed portion
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sourceData = audioBufferRef.current.getChannelData(channel)
      const targetData = trimmedBuffer.getChannelData(channel)
      for (let i = 0; i < trimmedLength; i++) {
        targetData[i] = sourceData[startSample + i]
      }
    }

    // Convert to WAV blob
    const wavBlob = audioBufferToWav(trimmedBuffer)
    return wavBlob
  }, [regionStart, regionEnd])

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
    setIsReady(false)
    setDuration(0)
    setRegionStart(0)
    setRegionEnd(0)
  }, [])

  return {
    waveformRef: setWaveformContainer,
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
    setRegion,
    getTrimmedAudio,
    destroy,
    // Zoom controls
    zoom,
    zoomIn,
    zoomOut,
    // Play mode
    playMode,
    setPlayMode,
  }
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
