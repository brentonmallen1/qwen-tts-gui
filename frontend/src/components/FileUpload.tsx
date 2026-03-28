import { useCallback, useState } from 'react'
import { Upload, X, FileAudio } from 'lucide-react'

interface FileUploadProps {
  onFileSelect: (file: File | null) => void
  accept?: string
  label?: string
}

export function FileUpload({ onFileSelect, accept = 'audio/*', label = 'Reference Audio' }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.type.startsWith('audio/')) {
      setFile(droppedFile)
      onFileSelect(droppedFile)
    }
  }, [onFileSelect])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      onFileSelect(selectedFile)
    }
  }, [onFileSelect])

  const handleRemove = useCallback(() => {
    setFile(null)
    onFileSelect(null)
  }, [onFileSelect])

  const inputId = `file-upload-${label.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">{label}</label>

      {file ? (
        <div className="flex items-center gap-3 p-4 bg-slate-800 border border-slate-700 rounded-lg">
          <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
            <FileAudio className="w-5 h-5 text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{file.name}</p>
            <p className="text-xs text-slate-400">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <button
            onClick={handleRemove}
            aria-label="Remove uploaded file"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
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
            accept={accept}
            onChange={handleFileSelect}
            aria-describedby={`${inputId}-hint`}
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
              <p id={`${inputId}-hint`} className="text-xs text-slate-500 mt-1">
                WAV, MP3, OGG · 3-20 seconds recommended
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
