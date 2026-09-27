import { useEffect, useState } from 'react'
import { useCart } from '../context/CartContext'
import { formatINR } from '../utils/format'

/**
 * Coupon entry for the cart and checkout. The code is stored with the cart; the server quote
 * decides whether it applies and returns the saving or the reason it doesn't.
 */
export default function CouponBox({ quote }) {
  const { couponCode, setCouponCode } = useCart()
  const [input, setInput] = useState(couponCode)
  const fresh = quote && quote.requested_code === couponCode   // quote reflects the current code
  const applied = Boolean(fresh && quote.coupon_code)
  const message = fresh && !applied ? quote.coupon_message : ''
  const checking = Boolean(couponCode) && !fresh

  useEffect(() => { setInput(couponCode) }, [couponCode])

  const apply = () => { if (input.trim()) setCouponCode(input) }
  const remove = () => { setCouponCode(''); setInput('') }

  return (
    <div className="border-t border-panel-2 pt-3 mt-3 mb-2">
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-2">Coupon code</p>
      {applied ? (
        <div className="flex items-center justify-between bg-acid/10 border border-acid/30 px-3 py-2" role="status">
          <span className="font-mono text-xs text-acid">
            {quote.coupon_code} · {quote.coupon_label}
            <span className="block text-[11px] opacity-80">You save {formatINR(quote.coupon_discount)}</span>
          </span>
          <button type="button" onClick={remove} className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-riot ml-2 px-2 py-2 shrink-0">Remove</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); apply() }} className="flex gap-2">
          <label htmlFor="coupon-input" className="sr-only">Coupon code</label>
          <input
            id="coupon-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="e.g. BOGO"
            autoCapitalize="characters"
            className="flex-1 min-w-0 bg-panel border border-panel-2 px-3 py-2 text-xs font-mono text-paper placeholder:text-slate-dim focus:border-acid outline-none transition-colors"
          />
          <button type="submit" disabled={!input.trim() || (checking && input.trim().toUpperCase() === couponCode)}
            className="font-mono text-[10px] uppercase tracking-widest text-acid border border-acid px-3 py-2.5 min-h-11 hover:bg-acid hover:text-ink transition-colors disabled:opacity-40 shrink-0">
            {checking ? '…' : 'Apply'}
          </button>
        </form>
      )}
      {couponCode && message && (
        <p className="font-mono text-[11px] text-riot mt-1.5" role="alert">{message}</p>
      )}
    </div>
  )
}
