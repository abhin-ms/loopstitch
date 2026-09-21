import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CartProvider } from './context/CartContext'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { CustomerAuthProvider } from './context/CustomerAuthContext'
import { WishlistProvider } from './context/WishlistContext'
import Loader from './components/Loader'

import PublicLayout from './components/PublicLayout'
import AdminLayout from './components/AdminLayout'
import ScrollToTop from './components/ScrollToTop'

const Home = lazy(() => import('./pages/Home'))
const Shop = lazy(() => import('./pages/Shop'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const Cart = lazy(() => import('./pages/Cart'))
const Checkout = lazy(() => import('./pages/Checkout'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'))
const OrderHistory = lazy(() => import('./pages/OrderHistory'))
const Customize = lazy(() => import('./pages/Customize'))
const About = lazy(() => import('./pages/About'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const NotFound = lazy(() => import('./pages/NotFound'))

const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const AdminProductForm = lazy(() => import('./pages/admin/AdminProductForm'))
const AdminOffers = lazy(() => import('./pages/admin/AdminOffers'))
const AdminOfferForm = lazy(() => import('./pages/admin/AdminOfferForm'))
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'))
const AdminCouponForm = lazy(() => import('./pages/admin/AdminCouponForm'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'))
const AdminCustomTshirt = lazy(() => import('./pages/admin/AdminCustomTshirt'))
const AdminCustomOrders = lazy(() => import('./pages/admin/AdminCustomOrders'))
const AdminAnnouncements = lazy(() => import('./pages/admin/AdminAnnouncements'))
const AdminInstagram = lazy(() => import('./pages/admin/AdminInstagram'))
const AdminReviews = lazy(() => import('./pages/admin/AdminReviews'))
const AdminSubscribers = lazy(() => import('./pages/admin/AdminSubscribers'))

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <CustomerAuthProvider>
          <CartProvider>
            <WishlistProvider>
            <ScrollToTop />
            <Suspense fallback={<Loader label="Loading" />}>
            <Routes>
              {/* Public storefront */}
              <Route element={<PublicLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/product/:slug" element={<ProductDetail />} />
                <Route path="/customize" element={<Customize />} />
                <Route path="/cart" element={<Cart />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/order/confirm" element={<OrderConfirmation />} />
                <Route path="/orders" element={<OrderHistory />} />
                <Route path="/about" element={<About />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="*" element={<NotFound />} />
              </Route>

              {/* Hidden admin area */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/new" element={<AdminProductForm />} />
                <Route path="products/:id" element={<AdminProductForm />} />
                <Route path="offers" element={<AdminOffers />} />
                <Route path="offers/new" element={<AdminOfferForm />} />
                <Route path="offers/:id" element={<AdminOfferForm />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="coupons/new" element={<AdminCouponForm />} />
                <Route path="coupons/:id" element={<AdminCouponForm />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="custom-tshirt" element={<AdminCustomTshirt />} />
                <Route path="custom-orders" element={<AdminCustomOrders />} />
                <Route path="notifications" element={<AdminNotifications />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route path="instagram" element={<AdminInstagram />} />
                <Route path="reviews" element={<AdminReviews />} />
                <Route path="subscribers" element={<AdminSubscribers />} />
                <Route path="*" element={<Navigate to="dashboard" replace />} />
              </Route>
            </Routes>
            </Suspense>
            </WishlistProvider>
          </CartProvider>
        </CustomerAuthProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  )
}
