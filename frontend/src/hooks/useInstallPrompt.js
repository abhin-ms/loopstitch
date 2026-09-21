import { useEffect, useState, useCallback } from 'react'

function detectIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ reports as "MacIntel" but has touch support — Safari only, no beforeinstallprompt.
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isIOSDevice || isIPadOS
}

function detectStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

/**
 * Cross-platform "install this app" state.
 * - Android/Chrome/Edge: captures the native beforeinstallprompt event so a
 *   custom button can trigger it (browsers only fire it once per page load).
 * - iOS Safari: never fires beforeinstallprompt — callers should show manual
 *   "Add to Home Screen" instructions when `isIOS` is true.
 */
export default function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(detectStandalone)
  const isIOS = detectIOS()

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setDeferredPrompt(null)
      setIsStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null
    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    return choice.outcome
  }, [deferredPrompt])

  return {
    canInstall: !!deferredPrompt && !isStandalone,
    isIOS,
    isStandalone,
    promptInstall,
  }
}
