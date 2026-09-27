import { useState } from 'react'
import { useCart } from '../context/CartContext'

// Tap to use: the code is saved to the cart (applied automatically there) and copied to the clipboard.
export default function CouponChip({ code, label, className = '' }) {
  const { couponCode, setCouponCode } = useCart()
  const [done, setDone] = useState(false)
  const active = couponCode === code

  const use = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setCouponCode(code)
    try { await navigator.clipboard.writeText(code) } catch { /* clipboard blocked; the code is applied anyway */ }
    setDone(true)
    setTimeout(() => setDone(false), 2500)
  }

  return (
    <button
      type="button"
      onClick={use}
      aria-label={`Use coupon ${code}${label ? `, ${label}` : ''}. It will be applied in your cart.`}
      className={`inline-flex items-center gap-2 border border-dashed border-current px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-widest ${className}`}
    >
      {done ? '✓ Applied to your cart' : active ? `✓ ${code} in your cart` : <>Use code {code}</>}
    </button>
  )
}
