import { useState, useCallback, useEffect } from 'react'

export interface Segment {
  start: number
  end: number
}

export interface Personality {
  id: string
  name: string
  description: string | null
  language: string
  transcript: string
  audio_url: string  // URL to reference.wav (concatenated segments for TTS)
  original_url: string | null  // URL to original.wav (full upload for editing)
  segments: Segment[]  // Segment definitions from original
  audio_duration: number | null
  created_at: string
  updated_at: string
}

interface UsePersonalitiesReturn {
  personalities: Personality[]
  isLoading: boolean
  error: string | null
  fetchPersonalities: () => Promise<void>
  createPersonality: (data: FormData) => Promise<Personality | null>
  updatePersonality: (id: string, data: { name?: string; description?: string; language?: string }) => Promise<Personality | null>
  updatePersonalityAudio: (id: string, data: FormData) => Promise<Personality | null>
  deletePersonality: (id: string) => Promise<boolean>
  transcribeAudio: (audioBlob: Blob) => Promise<string | null>
}

export function usePersonalities(): UsePersonalitiesReturn {
  const [personalities, setPersonalities] = useState<Personality[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPersonalities = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/personalities')
      if (!response.ok) {
        throw new Error('Failed to fetch personalities')
      }

      const data = await response.json()
      setPersonalities(data.personalities || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const createPersonality = useCallback(async (formData: FormData): Promise<Personality | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/personalities', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to create personality')
      }

      const personality = await response.json()

      // Refresh the list
      await fetchPersonalities()

      return personality
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [fetchPersonalities])

  const updatePersonality = useCallback(async (
    id: string,
    data: { name?: string; description?: string; language?: string }
  ): Promise<Personality | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/personalities/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to update personality')
      }

      const personality = await response.json()

      // Refresh the list
      await fetchPersonalities()

      return personality
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [fetchPersonalities])

  const updatePersonalityAudio = useCallback(async (
    id: string,
    formData: FormData
  ): Promise<Personality | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/personalities/${id}/audio`, {
        method: 'PUT',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to update audio')
      }

      const personality = await response.json()

      // Refresh the list
      await fetchPersonalities()

      return personality
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [fetchPersonalities])

  const deletePersonality = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/personalities/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to delete personality')
      }

      // Refresh the list
      await fetchPersonalities()

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [fetchPersonalities])

  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.wav')

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to transcribe audio')
      }

      const data = await response.json()
      return data.transcript || ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed')
      return null
    }
  }, [])

  // Load personalities on mount
  useEffect(() => {
    fetchPersonalities()
  }, [fetchPersonalities])

  return {
    personalities,
    isLoading,
    error,
    fetchPersonalities,
    createPersonality,
    updatePersonality,
    updatePersonalityAudio,
    deletePersonality,
    transcribeAudio,
  }
}
