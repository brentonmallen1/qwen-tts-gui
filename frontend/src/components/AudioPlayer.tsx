import { Download, Volume2 } from 'lucide-react'

interface AudioPlayerProps {
  audioUrl: string
  filename: string
  duration?: number | null
}

export function AudioPlayer({ audioUrl, filename, duration }: AudioPlayerProps) {

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
          <Volume2 className="w-5 h-5 text-primary-400" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-white">Generated Audio</h3>
          {duration && (
            <p className="text-sm text-slate-400">{duration.toFixed(1)}s · 24kHz WAV</p>
          )}
        </div>
        <button
          onClick={handleDownload}
          aria-label="Download audio file"
          className="btn-secondary flex items-center gap-2"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Download</span>
        </button>
      </div>

      <audio
        src={audioUrl}
        controls
        aria-label="Generated speech audio"
        className="w-full"
      />
    </div>
  )
}
