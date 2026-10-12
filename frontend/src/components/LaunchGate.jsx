import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import client from '../api/client'
import Loader from './Loader'
import { useAdminAuth } from '../context/AdminAuthContext'
import { configure as configureAnalytics, pageView } from '../utils/pixel'

const LaunchingSoon = lazy(() => import('../pages/LaunchingSoon'))
const VISIT_KEY = 'loopstitch_visit_counted'

// Anonymous visit counter for Admin → Dashboard: one "visit" per browsing session,
// one "page view" per page. Admins browsing their own store are not counted.
function trackPageView() {
  let newVisit = false
  try {
    newVisit = !sessionStorage.getItem(VISIT_KEY)
    sessionStorage.setItem(VISIT_KEY, '1')
  } catch { /* storage blocked: still count the page view */ }
  client.post('/api/track', { new_visit: newVisit }).catch(() => {})
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
