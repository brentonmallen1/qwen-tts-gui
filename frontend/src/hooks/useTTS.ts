import { useState, useCallback, useRef } from 'react'

interface GenerationResult {
  audio_url: string
  filename: string
  duration: number | null
  sample_rate: number
}

interface UseTTSReturn {
  isLoading: boolean
  error: string | null
  result: GenerationResult | null
  generateClone: (data: FormData) => Promise<void>
  generateDesign: (data: {
    text: string
    language: string
    instruct: string
  }) => Promise<void>
  generateCustom: (data: {
    text: string
    language: string
    speaker: string
    instruct?: string
    model_size: string
  }) => Promise<void>
  cancelGeneration: () => void
  clearResult: () => void
}

// Map HTTP status codes to user-friendly messages
function getErrorMessage(status: number, detail?: string): string {
  switch (status) {
    case 400:
      return detail || 'Invalid input. Please check your text and settings.'
    case 401:
      return 'Authentication required. Please log in.'
    case 413:
      return detail || 'File too large. Please use a smaller audio file.'
    case 422:
      return detail || 'Invalid request. Please check your input.'
    case 500:
      return detail || 'Server error. Please try again later.'
    case 503:
      return 'Service temporarily unavailable. Please try again later.'
    default:
      return detail || 'An unexpected error occurred. Please try again.'
  }
}

export function useTTS(): UseTTSReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      setError('Generation cancelled')
    }
  }, [])

  const generateClone = useCallback(async (formData: FormData) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/generate/clone', {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw { status: response.status, detail: errorData.detail }
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Generation cancelled')
      } else if (err && typeof err === 'object' && 'status' in err) {
        const e = err as { status: number; detail?: string }
        setError(getErrorMessage(e.status, e.detail))
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  const generateDesign = useCallback(async (data: {
    text: string
    language: string
    instruct: string
  }) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/generate/design', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw { status: response.status, detail: errorData.detail }
      }

      const result = await response.json()
      setResult(result)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Generation cancelled')
      } else if (err && typeof err === 'object' && 'status' in err) {
        const e = err as { status: number; detail?: string }
        setError(getErrorMessage(e.status, e.detail))
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  const generateCustom = useCallback(async (data: {
    text: string
    language: string
    speaker: string
    instruct?: string
    model_size: string
  }) => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/generate/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw { status: response.status, detail: errorData.detail }
      }

      const result = await response.json()
      setResult(result)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Generation cancelled')
      } else if (err && typeof err === 'object' && 'status' in err) {
        const e = err as { status: number; detail?: string }
        setError(getErrorMessage(e.status, e.detail))
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [])

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    isLoading,
    error,
    result,
    generateClone,
    generateDesign,
    generateCustom,
    cancelGeneration,
    clearResult,
  }
}
