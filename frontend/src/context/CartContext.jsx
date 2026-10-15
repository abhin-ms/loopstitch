import { createContext, useContext, useEffect, useRef, useState, useMemo } from 'react'
import { addToCart } from '../utils/pixel'
import client from '../api/client'
import { useAdminAuth } from './AdminAuthContext'

const CartContext = createContext(null)
const STORAGE_KEY = 'loopstitch_cart'
const COUPON_KEY = 'loopstitch_coupon'
const CART_ID_KEY = 'loopstitch_cart_id'
const ORIGIN_KEY = 'loopstitch_visit_origin'  // set by LaunchGate: where this visit came from

// Random id for this browser's cart, so Admin → Carts can follow one cart over time
function cartId() {
  try {
    let id = localStorage.getItem(CART_ID_KEY)
    if (!id) {
      id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 40)
      localStorage.setItem(CART_ID_KEY, id)
    }
    return id
  } catch { return '' }
}

// Tell the server what is in the cart now (Admin → Carts). Fire and forget.
function reportCart(items, reason = '') {
  const id = cartId()
  if (!id) return
  let origin = {}
  try { origin = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) || '{}') } catch { /* storage blocked */ }
  client.post('/api/cart-activity', {
    cart_id: id,
    reason,
    referrer: origin.referrer || '',
    utm_source: origin.utm_source || '',
    click_id: origin.click_id || '',
    items: items.slice(0, 50).map((i) => ({
      productId: i.productId, slug: i.slug || '', name: i.name || '', size: String(i.size || ''),
      color: i.color || '', image: i.image || '', quantity: i.quantity, price: i.price,
    })),
  }).catch(() => {})
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  // Cart report for the admin: sent shortly after each change (not on page load, and never for
  // an admin testing the shop). An empty cart right after checkout counts as "ordered".
  const { isAuthenticated: isAdmin } = useAdminAuth()
  const firstRender = useRef(true)
  const clearReason = useRef('')
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return undefined }
    if (isAdmin) return undefined
    const reason = clearReason.current
    clearReason.current = ''
    const timer = setTimeout(() => reportCart(items, reason), 800)
    return () => clearTimeout(timer)
  }, [items])  // eslint-disable-line react-hooks/exhaustive-deps

  // Coupon code travels with the cart (announcement -> cart -> checkout) and survives a refresh.
  // Whether it actually applies is always decided by the server quote.
  const [couponCode, setCouponCodeState] = useState(() => {
    try { return localStorage.getItem(COUPON_KEY) || '' } catch { return '' }
  })
  const setCouponCode = (code) => {
    const clean = (code || '').trim().toUpperCase()
    setCouponCodeState(clean)
    try { if (clean) localStorage.setItem(COUPON_KEY, clean); else localStorage.removeItem(COUPON_KEY) } catch { /* storage unavailable */ }
  }

  const addItem = (product, color, size, quantity, maxStock) => {
    addToCart(product, color?.id, size, quantity)  // Meta Pixel
    setItems((prev) => {
      const colorId = color?.id || ''
      const key = `${product.id}-${colorId}-${size}`
      const existing = prev.find((i) => i.key === key)
      if (existing) {
        const nextQty = Math.min(existing.quantity + quantity, maxStock)
        return prev.map((i) => (i.key === key ? { ...i, quantity: nextQty } : i))
      }
      return [
        ...prev,
        {
          key,
           productId: product.id,
          slug: product.slug,
          name: product.name,
          price: product.price,
           colorId: color?.id || null,
           color: color?.name || product.colorway || '',
           colorHex: color?.hex_code || '',
           image: color?.images?.[0]?.url || product.images?.[0]?.url || '',
           size,
          quantity: Math.min(quantity, maxStock),
          maxStock,
        },
      ]
    })
  }

  const updateQuantity = (key, quantity) => {
    setItems((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, quantity: Math.max(1, Math.min(quantity, i.maxStock)) } : i))
        .filter((i) => i.quantity > 0)
    )
  }

  const removeItem = (key) => setItems((prev) => prev.filter((i) => i.key !== key))
  // only called after an order is placed
  const clearCart = () => { clearReason.current = 'ordered'; setItems([]); setCouponCode('') }
  // Meta checkout link: the cart becomes exactly what the shopper picked in the Instagram / Facebook shop
  const replaceItems = (next) => setItems(next)

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  return (
    <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clearCart, replaceItems, subtotal, count, couponCode, setCouponCode }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
