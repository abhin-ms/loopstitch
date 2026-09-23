import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return undefined
    }
    // Pages are lazy-loaded, so the target may not exist yet; retry for a moment
    let tries = 0
    const timer = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (el || ++tries > 20) {
        clearInterval(timer)
        if (el) el.scrollIntoView({ block: 'start' })
      }
    }, 100)
    return () => clearInterval(timer)
  }, [pathname, hash])
  return null
}
