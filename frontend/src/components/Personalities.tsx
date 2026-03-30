import { useState, useCallback, useMemo } from 'react'
import { Plus, Trash2, Edit2, User, Loader2, AlertCircle, Search, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
import { usePersonalities, Personality } from '../hooks/usePersonalities'
import { PersonalityForm } from './PersonalityForm'

export function Personalities() {
  const {
    personalities,
    isLoading,
    error,
    createPersonality,
    updatePersonality,
    updatePersonalityAudio,
    deletePersonality,
    transcribeAudio,
  } = usePersonalities()

  const [showForm, setShowForm] = useState(false)
  const [editingPersonality, setEditingPersonality] = useState<Personality | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15

  // Filter and paginate personalities
  const filteredPersonalities = useMemo(() => {
    if (!searchQuery.trim()) return personalities
    const query = searchQuery.toLowerCase()
    return personalities.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query) ||
      p.language.toLowerCase().includes(query)
    )
  }, [personalities, searchQuery])

  const totalPages = Math.ceil(filteredPersonalities.length / itemsPerPage)
  const paginatedPersonalities = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredPersonalities.slice(start, start + itemsPerPage)
  }, [filteredPersonalities, currentPage])

  // Reset to page 1 when search changes
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    setCurrentPage(1)
  }, [])

  const handleCreate = useCallback(async (
    formData: FormData | { name?: string; description?: string; language?: string },
    _audioFormData?: FormData
  ) => {
    const result = await createPersonality(formData as FormData)
    if (result) {
      setShowForm(false)
    }
    return result !== null
  }, [createPersonality])

  const handleUpdate = useCallback(async (
    id: string,
    data: { name?: string; description?: string; language?: string },
    audioFormData?: FormData
  ) => {
    let success = true

    // Update metadata if provided
    if (data.name || data.description || data.language) {
      const result = await updatePersonality(id, data)
      if (!result) success = false
    }

    // Update audio if provided
    if (audioFormData) {
      const result = await updatePersonalityAudio(id, audioFormData)
      if (!result) success = false
    }

    if (success) {
      setEditingPersonality(null)
    }

    return success
  }, [updatePersonality, updatePersonalityAudio])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    await deletePersonality(id)
    setDeletingId(null)
    setConfirmDeleteId(null)
  }, [deletePersonality])

  const handleEdit = useCallback((personality: Personality) => {
    setEditingPersonality(personality)
    setShowForm(false)
  }, [])

  const handleCancelForm = useCallback(() => {
    setShowForm(false)
    setEditingPersonality(null)
  }, [])

  // Show form for creating or editing
  if (showForm || editingPersonality) {
    return (
      <PersonalityForm
        personality={editingPersonality}
        onSubmit={editingPersonality
          ? (data, audioFormData) => handleUpdate(editingPersonality.id, data as { name?: string; description?: string; language?: string }, audioFormData)
          : handleCreate
        }
        onCancel={handleCancelForm}
        transcribeAudio={transcribeAudio}
        isLoading={isLoading}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Voice Personalities</h2>
            <p className="text-sm text-slate-400 mt-1">
              Create and manage reusable voice presets for quick generation
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Personality
          </button>
        </div>

        {/* Search bar */}
        {personalities.length > 0 && (
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search personalities..."
              aria-label="Search personalities"
              className="input-field pl-10"
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-4 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading state */}
        {isLoading && personalities.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && personalities.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No personalities yet</h3>
            <p className="text-sm text-slate-400 mb-4">
              Create your first voice personality to get started
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Personality
            </button>
          </div>
        )}

        {/* No search results */}
        {personalities.length > 0 && filteredPersonalities.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-400">No personalities match your search</p>
          </div>
        )}

        {/* Personalities list */}
        {paginatedPersonalities.length > 0 && (
          <>
            <div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedPersonalities.map((personality) => (
                  <div
                    key={personality.id}
                    className="p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                          <User className="w-5 h-5 text-primary-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white">{personality.name}</h3>
                          <p className="text-xs text-slate-400">{personality.language}</p>
                        </div>
                      </div>
                    </div>

                    {personality.description && (
                      <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                        {personality.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                      <span>
                        {personality.audio_duration
                          ? `${personality.audio_duration.toFixed(1)}s audio`
                          : 'No audio'}
                      </span>
                      <span>
                        {new Date(personality.updated_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(personality)}
                        className="flex-1 btn-secondary flex items-center justify-center gap-2 text-sm"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                      {confirmDeleteId === personality.id ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleDelete(personality.id)}
                            disabled={deletingId === personality.id}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                            aria-label="Confirm delete"
                          >
                            {deletingId === personality.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                            aria-label="Cancel delete"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(personality.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          aria-label="Delete personality"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                <p className="text-sm text-slate-400">
                  Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredPersonalities.length)} of {filteredPersonalities.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-slate-300 min-w-[80px] text-center">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
