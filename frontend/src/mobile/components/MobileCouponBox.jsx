import { useEffect, useState } from 'react'
import { useCart } from '../../context/CartContext'
import { formatINR } from '../../utils/format'

// Phone-app version of the coupon box: same cart-stored code, same server decision.
export default function MobileCouponBox({ quote }) {
  const { couponCode, setCouponCode } = useCart()
  const [input, setInput] = useState(couponCode)
  const fresh = quote && quote.requested_code === couponCode
  const applied = Boolean(fresh && quote.coupon_code)
  const message = fresh && !applied ? quote.coupon_message : ''
  const checking = Boolean(couponCode) && !fresh

  useEffect(() => { setInput(couponCode) }, [couponCode])

  return (
    <div style={{ margin: '4px 0 14px' }}>
      <p className="ls-field-label" style={{ marginBottom: 6 }}>Coupon code</p>
      {applied ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '2px solid var(--ls-accent)', padding: '10px 12px' }} role="status">
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ls-accent)' }}>
            {quote.coupon_code} · {quote.coupon_label}
            <span style={{ display: 'block', fontWeight: 500, fontSize: 12 }}>You save {formatINR(quote.coupon_discount)}</span>
          </span>
          <button type="button" onClick={() => { setCouponCode(''); setInput('') }} style={{ background: 'none', border: 0, fontWeight: 700, fontSize: 12, padding: '10px 4px', color: 'inherit' }}>Remove</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) setCouponCode(input) }} style={{ display: 'flex', gap: 8 }}>
          <input className="ls-input" aria-label="Coupon code" value={input} placeholder="e.g. BOGO" autoCapitalize="characters"
            onChange={(e) => setInput(e.target.value.toUpperCase())} style={{ flex: 1, minWidth: 0 }} />
          <button type="submit" className="ls-option" disabled={!input.trim() || (checking && input.trim().toUpperCase() === couponCode)} style={{ flex: '0 0 auto', minHeight: 44 }}>
            {checking ? '…' : 'Apply'}
          </button>
        </form>
      )}
      {couponCode && message && <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ls-accent)' }} role="alert">{message}</p>}
    </div>
  )
}
