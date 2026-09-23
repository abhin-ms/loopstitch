import { useState, useEffect } from 'react'
import { Suspense } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import Loader from './Loader'
import { useAdminAuth } from '../context/AdminAuthContext'
import useNoIndex from '../hooks/useNoIndex'

const LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/custom-tshirt', label: 'Custom T-Shirt' },
  { to: '/admin/custom-orders', label: 'Custom Orders' },
  { to: '/admin/announcements', label: 'Announcements' },
  { to: '/admin/offers', label: 'Offers' },
  { to: '/admin/coupons', label: 'Coupons' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/instagram', label: 'Instagram' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/subscribers', label: 'Subscribers' },
  { to: '/admin/notifications', label: 'Notifications' },
  { to: '/admin/settings', label: 'Settings' },
]

function HamburgerIcon({ className }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon({ className }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default function AdminLayout() {
  useNoIndex()
  const { isAuthenticated, loading, logout, admin } = useAdminAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (loading) {
    return <div className="min-h-screen bg-ink flex items-center justify-center font-mono text-slate text-sm">Loading…</div>
  }
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  return (
    <div className="min-h-screen bg-ink flex overflow-x-hidden">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-ink border-b border-panel-2 h-14 flex items-center px-4 gap-4">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-paper hover:text-acid transition-colors shrink-0 p-2 min-w-11 min-h-11 flex items-center justify-center"
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>
        <div className="font-display text-lg text-paper">
          LOOPSTITCH<span className="text-riot">.</span>
        </div>
      </div>

      {/* Backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-ink border-r border-panel-2 flex flex-col shrink-0 transform transition-transform duration-250 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar header */}
        <div className="px-5 py-5 border-b border-panel-2 flex items-center justify-between">
          <div>
            <div className="font-display text-lg text-paper">LOOPSTITCH<span className="text-riot">.</span></div>
            <p className="font-mono text-[10px] text-slate uppercase tracking-widest mt-0.5">Admin</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate hover:text-paper transition-colors p-2 min-w-11 min-h-11 flex items-center justify-center"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `block px-3 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                  isActive ? 'bg-panel text-acid' : 'text-slate hover:text-paper'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-panel-2">
          {admin && <p className="font-mono text-[11px] text-slate mb-3 truncate">Signed in as {admin.username}</p>}
          <button onClick={logout} className="font-mono text-xs uppercase tracking-widest text-riot hover:text-acid py-2">
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 lg:ml-60 pt-14 lg:pt-0 px-4 sm:px-8 lg:px-10 py-6 lg:py-10">
        <Suspense fallback={<Loader label="Loading" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
