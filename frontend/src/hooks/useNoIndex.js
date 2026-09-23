import { useEffect } from 'react'

// Keeps private screens (admin) out of search results, alongside the X-Robots-Tag header in nginx
export default function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}
