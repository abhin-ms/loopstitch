import { createContext, useContext, useEffect, useState, useMemo } from 'react'

const CartContext = createContext(null)
const STORAGE_KEY = 'loopstitch_cart'
const COUPON_KEY = 'loopstitch_coupon'

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
  const clearCart = () => { setItems([]); setCouponCode('') }

  const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items])
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  return (
    <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clearCart, subtotal, count, couponCode, setCouponCode }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
