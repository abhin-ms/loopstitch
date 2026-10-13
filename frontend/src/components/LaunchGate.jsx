import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import client from '../api/client'
import Loader from './Loader'
import { useAdminAuth } from '../context/AdminAuthContext'
import { configure as configureAnalytics, pageView } from '../utils/pixel'

const LaunchingSoon = lazy(() => import('../pages/LaunchingSoon'))
const VISIT_KEY = 'loopstitch_visit_counted'
const ORIGIN_KEY = 'loopstitch_visit_origin'
const HEARTBEAT_MS = 30000

// Where this visit came from (the site that linked here, ?utm_source, an ad click id) and a
// random id for this tab. Worked out once on arrival and kept for the tab's lifetime, so
// Admin → Visitors can show "from Instagram, on mobile, online now". Nothing personal.
function visitOrigin() {
  try {
    const saved = sessionStorage.getItem(ORIGIN_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* storage blocked */ }
  const query = new URLSearchParams(window.location.search)
  const origin = {
    sid: (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 40),
    referrer: (document.referrer || '').slice(0, 500),
    utm_source: (query.get('utm_source') || '').slice(0, 80),
    click_id: query.has('fbclid') ? 'fbclid' : query.has('gclid') ? 'gclid' : '',
  }
  try { sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(origin)) } catch { /* storage blocked */ }
  return origin
}

// Anonymous visit counter for Admin → Dashboard / Visitors: one "visit" per browsing session,
// one "page view" per page. Admins browsing their own store are not counted.
function trackPageView(heartbeat = false) {
  let newVisit = false
  const origin = visitOrigin()
  if (!heartbeat) {
    try {
      newVisit = !sessionStorage.getItem(VISIT_KEY)
      sessionStorage.setItem(VISIT_KEY, '1')
    } catch { /* storage blocked: still count the page view */ }
  }
  client.post('/api/track', { ...origin, new_visit: newVisit, heartbeat, path: window.location.pathname.slice(0, 300) }).catch(() => {})
}

// Wraps the storefront + mobile app. While "launch mode" is on in admin
// settings, visitors only ever see the launching soon page. A logged-in
// admin still sees the real site (with a reminder strip) to check it before going live.
export default function LaunchGate() {
  const { isAuthenticated, loading: adminLoading } = useAdminAuth()
  const [launch, setLaunch] = useState(null)
  // ?preview-launch lets the admin see the page without switching it on
  const { pathname, search } = useLocation()
  const preview = new URLSearchParams(search).has('preview-launch')

  useEffect(() => {
    if (adminLoading || isAuthenticated) return
    trackPageView()
    pageView()  // Meta Pixel
  }, [pathname, adminLoading, isAuthenticated])

  // "still here" ping while the tab is open and visible, for the live visitor count
  useEffect(() => {
    if (adminLoading || isAuthenticated) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') trackPageView(true)
    }, HEARTBEAT_MS)
    return () => clearInterval(timer)
  }, [adminLoading, isAuthenticated])

  useEffect(() => {
    client
      .get('/api/settings/launch')
      .then((res) => {
        setLaunch(res.data)
        configureAnalytics({ pixelId: res.data.meta_pixel_id, ga4Id: res.data.ga4_id })
      })
      .catch(() => {
        setLaunch({ launch_mode: false }) // never lock visitors out because of a network blip
        configureAnalytics()
      })
  }, [])

  if (!launch || adminLoading) return <Loader label="Loading" />

  if ((launch.launch_mode && !isAuthenticated) || preview) {
    return (
      <Suspense fallback={<Loader label="Loading" />}>
        <LaunchingSoon date={launch.launch_date} message={launch.launch_message} />
      </Suspense>
    )
  }

  return (
    <>
      {launch.launch_mode && (
        <div className="bg-acid text-ink font-mono text-[11px] uppercase tracking-widest text-center px-4 py-2">
          Launch mode is ON — visitors only see the launching soon page.{' '}
          <Link to="/admin/settings" className="underline">Change in settings</Link>
        </div>
      )}
      <Outlet />
    </>
  )
}
