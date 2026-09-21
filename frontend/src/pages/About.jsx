import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useInstallPrompt from '../hooks/useInstallPrompt'
import InstallAppModal from '../components/InstallAppModal'

// Set this once the Android build is live on Google Play — see the Play
// Store submission notes in the PR/session for how to get there (PWABuilder
// or Bubblewrap wrapping https://loopstitch.online/app into an .aab).
const PLAY_STORE_URL = ''

export default function About() {
  const { canInstall, promptInstall } = useInstallPrompt()
  const [showIOSModal, setShowIOSModal] = useState(false)

  useEffect(() => {
    document.title = 'About | Loopstitch Co.'
    return () => { document.title = 'Loopstitch Co.' }
  }, [])

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
      <p className="font-mono text-xs text-riot tracking-widest uppercase mb-4">About</p>
      <h1 className="font-display text-4xl sm:text-5xl uppercase text-paper mb-8 leading-tight">
        Built for people who read the credits.
      </h1>
      <div className="space-y-5 text-paper/75 text-sm sm:text-base leading-relaxed">
        <p>
          Loopstitch Co. started in Naduvannur, Calicut, with one idea: streetwear that actually
          gets anime right — not a licensed logo slapped on a blank tee, but original graphics designed
          for the culture.
        </p>
        <p>
          Every drop is DTF printed on heavyweight 240 GSM cotton in small batches, usually under a
          hundred pieces split across a couple of colorways. We don't restock. When a size is gone,
          it's locked — permanently — which means what you're wearing genuinely won't be everywhere.
        </p>
        <p>
          No mass production, no filler collections. Just tees worth keeping.
        </p>
      </div>

      <div className="mt-14 pt-10 border-t border-panel-2">
        <p className="font-mono text-xs text-riot tracking-widest uppercase mb-3">Get the app</p>
        <h2 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-4">
          Shop and reorder faster from your phone.
        </h2>
        <p className="text-paper/70 text-sm leading-relaxed mb-6 max-w-lg">
          Same account, same cart, same orders — just a faster, app-like way to browse drops and check out.
        </p>
        <div className="flex flex-wrap gap-3">
          {PLAY_STORE_URL ? (
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors"
            >
              Get it on Google Play
            </a>
          ) : canInstall ? (
            <button
              onClick={promptInstall}
              className="bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors"
            >
              Install for Android
            </button>
          ) : (
            <Link
              to="/app"
              className="bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors"
            >
              Open the app · Android
            </Link>
          )}
          <button
            onClick={() => setShowIOSModal(true)}
            className="border border-panel-2 text-paper font-mono text-sm uppercase tracking-widest px-6 py-3.5 hover:border-paper transition-colors"
          >
            Add to Home Screen · iPhone
          </button>
        </div>
        {!PLAY_STORE_URL && (
          <p className="font-mono text-[11px] text-slate mt-3">Play Store listing coming soon.</p>
        )}
      </div>

      <InstallAppModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </div>
  )
}
