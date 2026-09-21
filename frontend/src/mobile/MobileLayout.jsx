import { Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useCustomerAuth } from '../context/CustomerAuthContext'
import { ToastProvider } from './context/ToastContext'
import { BackIcon, CartIcon, HomeIcon, ShopIcon, CustomIcon, AccountIcon } from './icons'
import './mobile.css'

// Ordered most-specific-path first. `tab` is the tab-bar key for the 5 root
// screens; screens pushed on top of a tab (product, checkout, ...) get tab: null,
// which both hides the tab bar and shows the back chevron — same rule the
// design prototype uses (canBack = stack.length > 1).
const SCREENS = [
  { path: '/app/customize/checkout', title: 'Custom checkout', tab: null },
  { path: '/app/product', title: 'Product', tab: null },
  { path: '/app/checkout', title: 'Checkout', tab: null },
  { path: '/app/order/confirm', title: 'Order placed', tab: null },
  { path: '/app/orders', title: 'My orders', tab: null },
  { path: '/app/login', title: 'Log in', tab: null },
  { path: '/app/shop', title: 'Shop', tab: 'shop' },
  { path: '/app/customize', title: 'Custom print', tab: 'customize' },
  { path: '/app/cart', title: 'Cart', tab: 'cart' },
  { path: '/app/account', title: 'Account', tab: 'account' },
  { path: '/app', title: 'Loopstitch', tab: 'home', exact: true },
]

function matchScreen(pathname) {
  return (
    SCREENS.find((s) =>
      s.exact ? pathname === s.path : pathname === s.path || pathname.startsWith(`${s.path}/`)
    ) || SCREENS[SCREENS.length - 1]
  )
}

const TABS = [
  { key: 'home', label: 'Home', path: '/app', icon: HomeIcon },
  { key: 'shop', label: 'Shop', path: '/app/shop', icon: ShopIcon },
  { key: 'customize', label: 'Custom', path: '/app/customize', icon: CustomIcon },
  { key: 'cart', label: 'Cart', path: '/app/cart', icon: CartIcon },
  { key: 'account', label: 'Account', path: '/app/account', icon: AccountIcon, authPath: '/app/login' },
]

function MobileChrome() {
  const location = useLocation()
  const navigate = useNavigate()
  const { count } = useCart()
  const { isAuthenticated } = useCustomerAuth()
  const screen = matchScreen(location.pathname)
  const canBack = screen.tab == null

  return (
    <div className="mobile-app">
      <div className="ls-header">
        {canBack && (
          <button className="ls-icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
            <BackIcon />
          </button>
        )}
        <span className="ls-header-title">{screen.title}</span>
        <button className="ls-icon-btn ls-cart-wrap" aria-label="Cart" onClick={() => navigate('/app/cart')}>
          <CartIcon />
          {count > 0 && <span className="ls-cart-badge">{count}</span>}
        </button>
      </div>

      <div style={{ flex: 1 }}>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </div>

      {screen.tab && (
        <div className="ls-tabbar">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = screen.tab === tab.key
            const target = tab.key === 'account' && !isAuthenticated ? tab.authPath : tab.path
            return (
              <button
                key={tab.key}
                className={`ls-tab${active ? ' active' : ''}`}
                onClick={() => navigate(target)}
              >
                <Icon />
                <span className="ls-tab-label">{tab.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MobileLayout() {
  return (
    <div className="mobile-app-shell">
      <ToastProvider>
        <MobileChrome />
      </ToastProvider>
    </div>
  )
}
