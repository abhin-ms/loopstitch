import { useEffect, useRef, useState } from 'react'
import client from '../api/client'

/**
 * Live totals preview from the server (subtotal / BOGO discount / coupon / shipping).
 * Debounced so quantity spamming doesn't hammer the API.
 */
export default function useQuote(items, couponCode = '') {
  const [quote, setQuote] = useState(null)
  const timer = useRef(null)

  useEffect(() => {
    if (!items.length) {
      setQuote(null)
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await client.post('/api/cart/quote', {
          items: items.map((i) => ({ product_id: i.productId, color_id: i.colorId || undefined, size: i.size, quantity: i.quantity })),
          coupon_code: couponCode || undefined,
        })
        // remember which code this quote was calculated for, so the UI never shows a stale result
        setQuote({ ...res.data, requested_code: couponCode || '' })
      } catch {
        setQuote(null)
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [items, couponCode])

  return quote
}
