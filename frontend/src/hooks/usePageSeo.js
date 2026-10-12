import { useEffect } from 'react'
import pages from '../content/pages.json'

function setMeta(selector, attr, key, value) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

// Title + description for a static page, from the same file the server renders
// (src/content/pages.json), so in-app navigation matches what Google was sent.
// Canonical / og:url are kept in step with the route by PublicLayout.
export default function usePageSeo(key) {
  useEffect(() => {
    const page = pages[key]
    if (!page) return undefined
    document.title = page.title
    setMeta('meta[name="description"]', 'name', 'description', page.description)
    setMeta('meta[property="og:title"]', 'property', 'og:title', page.title)
    setMeta('meta[property="og:description"]', 'property', 'og:description', page.description)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', page.title)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', page.description)
    return () => { document.title = 'Loopstitch' }
  }, [key])
}
