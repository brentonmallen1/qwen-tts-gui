import { Mic2, Github } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <Mic2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Qwen3 TTS</h1>
              <p className="text-xs text-slate-400">Text to Speech</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://github.com/brentonmallen1/qwen-tts-gui"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
              aria-label="View on GitHub"
            >
              <Github className="w-5 h-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>
            {' '} <span className="tabular-nums">{import.meta.env.VITE_APP_VERSION || 'dev'}</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
