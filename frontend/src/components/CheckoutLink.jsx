import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import client from '../api/client'
import Loader from './Loader'
import { useCart } from '../context/CartContext'

// Meta checkout URL: shoppers who tap "Buy" in the Instagram / Facebook shop land on
//   /checkout?products=<catalogue id>:<qty>,<catalogue id>:<qty>&coupon=CODE
// The cart is filled with exactly those items (ids are the ones in /feeds/meta.csv), the coupon
// is applied, and the normal checkout takes over. Without ?products this does nothing.
export default function CheckoutLink({ children }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { replaceItems, setCouponCode } = useCart()
  const products = params.get('products')
  const coupon = params.get('coupon')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!products) return undefined
    let cancelled = false
    client
      .get('/api/checkout-link', { params: { products } })
      .then((res) => {
        if (cancelled) return
        if (!res.data.items.length) { setFailed(true); return }
        replaceItems(res.data.items)
        setCouponCode(coupon || '')
        navigate('/checkout', { replace: true })  // drop the query so a refresh keeps cart edits
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [products])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!products) return children
  if (failed) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <p className="text-slate font-mono text-sm mb-6">Sorry, that item just sold out or is no longer available.</p>
        <Link to="/shop" className="text-acid font-mono text-xs uppercase tracking-widest">See what's in stock →</Link>
      </div>
    )
  }
  return <Loader label="Loading your cart" />
}
