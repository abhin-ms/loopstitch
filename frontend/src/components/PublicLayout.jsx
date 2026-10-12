import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Loader from './Loader'
import Navbar from './Navbar'
import Footer from './Footer'
import SewingCursor from './SewingCursor'
import TouchFeedback from './TouchFeedback'
import AnnouncementBar from './AnnouncementBar'
import InstallAppBanner from './InstallAppBanner'

const SITE = 'https://loopstitch.online'
const PRIVATE_PATHS = ['/cart', '/checkout', '/orders', '/order/confirm']

function setHeadTag(selector, create, value, attr) {
  let el = document.head.querySelector(selector)
  if (!el) { el = create(); document.head.appendChild(el) }
  el.setAttribute(attr, value)
  return el
}

export default function PublicLayout() {
  const { pathname } = useLocation()

  // One index.html serves every route, so canonical / og:url / robots must follow the route
  useEffect(() => {
    const url = `${SITE}${pathname === '/' ? '/' : pathname.replace(/\/$/, '')}`
    setHeadTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), url, 'href')
    setHeadTag('meta[property="og:url"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:url'); return m }, url, 'content')
    const robots = document.head.querySelector('meta[name="robots"]')
    if (PRIVATE_PATHS.some((p) => pathname.startsWith(p))) {
      setHeadTag('meta[name="robots"]', () => { const m = document.createElement('meta'); m.setAttribute('name', 'robots'); return m }, 'noindex, nofollow', 'content')
    } else if (robots) {
      robots.remove()
    }
  }, [pathname])

  return (
    <div className="min-h-screen flex flex-col bg-ink">
      <SewingCursor />
      <TouchFeedback />
      <AnnouncementBar />
      <InstallAppBanner />
      <Navbar />
      {/* min-h-screen: the footer starts below the fold, so it can't jump down the screen
          when the page content arrives (that jump was a 0.56 layout shift on mobile) */}
      <main id="main" className="flex-1 min-h-screen">
        <Suspense fallback={<Loader label="Loading" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}
