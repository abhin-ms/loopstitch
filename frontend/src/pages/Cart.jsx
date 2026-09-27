import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../context/CartContext'
import useQuote from '../hooks/useQuote'
import client, { mediaUrl } from '../api/client'
import { formatINR } from '../utils/format'
import CouponBox from '../components/CouponBox'

export default function Cart() {
  const { items, updateQuantity, removeItem, subtotal, couponCode } = useCart()
  const navigate = useNavigate()
  const quote = useQuote(items, couponCode)
  const [freeShipAt, setFreeShipAt] = useState(0)

  useEffect(() => {
    client.get('/api/settings/shipping').then((res) => setFreeShipAt(res.data.free_shipping_threshold || 0)).catch(() => {})
  }, [])

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <h1 className="font-display text-3xl uppercase text-paper mb-3">Your cart is empty</h1>
        <p className="text-slate text-sm mb-8">Nothing locked in yet — go find something worth wearing.</p>
        <Link to="/shop" className="bg-riot text-ink font-mono text-sm uppercase tracking-widest px-7 py-3.5 hover:bg-acid transition-colors">
          Shop the drop
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
      <h1 className="font-display text-3xl sm:text-4xl uppercase text-paper mb-8 sm:mb-10">Your cart</h1>

      {freeShipAt > 0 && (
        <div className="mb-8 border border-panel-2 p-4" role="status">
          <p className="font-mono text-xs text-paper mb-2">
            {subtotal >= freeShipAt ? '✓ You\'ve unlocked free shipping' : `Add ${formatINR(freeShipAt - subtotal)} more for free shipping`}
          </p>
          <div className="h-1.5 bg-panel-2" aria-hidden="true">
            <div className="h-full bg-acid transition-all duration-500" style={{ width: `${Math.min(100, (subtotal / freeShipAt) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-1">
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.key}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-4 py-5 border-b border-panel-2"
              >
                <div className="w-20 h-24 bg-panel shrink-0 overflow-hidden">
                  {item.image && <img src={mediaUrl(item.image)} alt={item.name} className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between gap-3 min-w-0">
                    <div className="min-w-0">
                      <Link to={`/product/${item.slug}`} className="font-body text-paper text-sm hover:text-acid break-words inline-block py-2 -my-2">{item.name}</Link>
                       <p className="font-mono text-xs text-slate mt-1 flex items-center gap-2">{item.colorHex && <span className="w-3 h-3 rounded-full border border-paper/30" style={{ backgroundColor: item.colorHex }} />} {item.color && `${item.color} / `}SIZE {item.size}</p>
                    </div>
                    <span className="font-mono text-sm text-paper shrink-0">{formatINR(item.price * item.quantity)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center border border-panel-2">
                      <button onClick={() => updateQuantity(item.key, item.quantity - 1)} disabled={item.quantity <= 1} className="w-10 h-10 font-mono text-paper hover:text-acid disabled:text-slate-dim disabled:cursor-not-allowed" aria-label="Decrease quantity">−</button>
                      <span className="w-9 text-center font-mono text-xs text-paper">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.key, item.quantity + 1)}
                        disabled={item.quantity >= item.maxStock}
                        className="w-10 h-10 font-mono text-paper hover:text-acid disabled:text-slate-dim disabled:cursor-not-allowed"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <button onClick={() => removeItem(item.key)} className="font-mono text-[11px] uppercase tracking-widest text-slate hover:text-riot px-3 py-2">
                      Remove
                    </button>
                  </div>
                  {item.quantity >= item.maxStock && (
                    <p className="font-mono text-[10px] text-acid mt-1">Max stock for this size reached</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="h-fit border border-panel-2 p-6">
          <div className="flex justify-between text-sm text-paper/80 mb-2">
            <span>Subtotal</span>
            <span className="font-mono">{formatINR(subtotal)}</span>
          </div>
          {quote && quote.discount > 0 && (
            <div className="flex justify-between text-sm text-acid mb-2">
              <span>Offer · {quote.offer_label}</span>
              <span className="font-mono">−{formatINR(quote.discount)}</span>
            </div>
          )}

          <CouponBox quote={quote} />

          {quote && quote.coupon_discount > 0 && (
            <div className="flex justify-between text-sm text-acid mb-2">
              <span>Coupon · {quote.coupon_code}</span>
              <span className="font-mono">−{formatINR(quote.coupon_discount)}</span>
            </div>
          )}

          {quote && (
            <>
              <div className="flex justify-between text-sm text-paper/80 mb-2">
                <span>Delivery</span>
                <span className="font-mono">{quote.shipping_fee === 0 ? 'FREE' : formatINR(quote.shipping_fee)}</span>
              </div>
              <div className="border-t border-panel-2 pt-3 flex justify-between text-sm text-paper mb-2">
                <span>Total</span>
                <span className="font-mono">{formatINR(quote.total)}</span>
              </div>
            </>
          )}
          <p className="font-mono text-[11px] text-slate mb-6">Final totals confirmed at checkout</p>
          <button
            onClick={() => navigate('/checkout')}
            className="w-full bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors"
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  )
}
