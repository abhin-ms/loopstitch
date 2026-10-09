import { useEffect, useState } from 'react'
import useInstallPrompt from '../hooks/useInstallPrompt'
import InstallAppModal from './InstallAppModal'

const DISMISS_KEY = 'loopstitch_install_banner_dismissed'
const VISITS_KEY = 'loopstitch_visits'
const SESSION_KEY = 'loopstitch_visit_counted'

// Phones only, and only from the visitor's 2nd visit — a first-time visitor
// should see the store, not an install pitch stacked under the offer bar.
function isReturningPhoneVisitor() {
  if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches) return false
  try {
    let visits = Number(localStorage.getItem(VISITS_KEY) || 0)
    if (!sessionStorage.getItem(SESSION_KEY)) {
      visits += 1
      localStorage.setItem(VISITS_KEY, String(visits))
      sessionStorage.setItem(SESSION_KEY, '1')
    }
    return visits >= 2
  } catch {
    return false
  }
}

export default function InstallAppBanner() {
  const { canInstall, isIOS, isStandalone, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [showIOSModal, setShowIOSModal] = useState(false)
  const [eligible] = useState(isReturningPhoneVisitor)

  useEffect(() => {
    if (isStandalone) setDismissed(true)
  }, [isStandalone])

  const handleClose = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch { /* ignore */ }
  }

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall()
      handleClose()
    } else if (isIOS) {
      setShowIOSModal(true)
    }
  }

  if (!eligible || dismissed || isStandalone || !(canInstall || isIOS)) return null

  return (
    <>
      <div className="relative bg-riot text-ink border-b border-panel-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="w-7 h-7 shrink-0" />
          <p className="flex-1 min-w-0 font-mono text-xs sm:text-[13px] font-semibold truncate">
            Get the Loopstitch app — faster shop &amp; checkout on your phone.
          </p>
          <button
            onClick={handleInstall}
            className="shrink-0 bg-ink text-paper font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 hover:bg-panel-2 transition-colors"
          >
            Install
          </button>
          <button
            onClick={handleClose}
            aria-label="Dismiss"
            className="shrink-0 min-w-8 min-h-8 flex items-center justify-center text-ink/70 hover:text-ink text-lg leading-none"
          >
            &#10005;
          </button>
        </div>
      </div>
      <InstallAppModal open={showIOSModal} onClose={() => { setShowIOSModal(false); handleClose() }} />
    </>
  )
}
