import { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import client from '../api/client'
import { loadRazorpay } from '../utils/razorpay'
import { useCart } from '../context/CartContext'
import { useCustomerAuth } from '../context/CustomerAuthContext'
import useQuote from '../hooks/useQuote'
import { formatINR } from '../utils/format'

function normalizePhone(value) {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 10) return digits
  if (digits.startsWith('91') && digits.length > 10) return digits.slice(-10)
  if (digits.startsWith('0') && digits.length > 10) return digits.slice(-10)
  return digits.slice(-10)
}

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart()
  const { customer, isAuthenticated, addresses, loadAddresses, addAddress } = useCustomerAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const couponFromCart = location.state?.couponCode || ''
  const [couponCode, setCouponCode] = useState(couponFromCart)
  const [couponApplied, setCouponApplied] = useState(null)
  const [couponError, setCouponError] = useState(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const quote = useQuote(items, couponApplied?.code || couponFromCart || '')

  // Form state — initialized empty, populated from customer profile
  const [form, setForm] = useState({
    customer_name: '', customer_email: '', customer_phone: '',
    shipping_address: '', city: '', state: '', pincode: '',
  })
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [showNewAddress, setShowNewAddress] = useState(false)
  const [addressesLoaded, setAddressesLoaded] = useState(false)

  const [error, setError] = useState(null)
  const [step, setStep] = useState('form')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [payProcessing, setPayProcessing] = useState(false)
  const [codEnabled, setCodEnabled] = useState(false)
  const [codAdvancePercent, setCodAdvancePercent] = useState(10)
  const [razorpayKeyId, setRazorpayKeyId] = useState('')

  // Razorpay's script is only needed here, so load it on demand instead of on every page
  useEffect(() => { loadRazorpay() }, [])

  // Load checkout settings
  useEffect(() => {
    client.get('/api/settings/checkout').then((res) => {
      setCodEnabled(res.data.cod_enabled)
      setCodAdvancePercent(res.data.cod_advance_percent || 10)
      setRazorpayKeyId(res.data.razorpay_key_id || '')
    }).catch(() => {})
  }, [])

  // Auto-fill from customer profile + load saved addresses
  useEffect(() => {
    if (isAuthenticated && customer) {
      setForm((f) => ({
        ...f,
        customer_name: f.customer_name || customer.name || '',
        customer_email: f.customer_email || customer.email || '',
        customer_phone: f.customer_phone || customer.phone || '',
      }))
      if (!addressesLoaded) {
        loadAddresses().then((addrs) => {
          setAddressesLoaded(true)
          if (addrs && addrs.length > 0) {
            const defaultAddr = addrs.find((a) => a.is_default) || addrs[0]
            setSelectedAddressId(defaultAddr.id)
            setForm((f) => ({
              ...f,
              shipping_address: defaultAddr.full_address,
              city: defaultAddr.city,
              state: defaultAddr.state,
              pincode: defaultAddr.pincode,
            }))
          } else {
            setShowNewAddress(true)
          }
        })
      }
    }
  }, [isAuthenticated, customer, addressesLoaded])

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <p className="text-slate font-mono text-sm mb-6">Your cart is empty.</p>
        <Link to="/shop" className="text-acid font-mono text-xs uppercase tracking-widest">← Back to shop</Link>
      </div>
    )
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'customer_phone') {
      setForm((f) => ({ ...f, [name]: normalizePhone(value) }))
    } else {
      setForm((f) => ({ ...f, [name]: value }))
    }
    // If user edits address fields, deselect saved address
    if (['shipping_address', 'city', 'state', 'pincode'].includes(name)) {
      setSelectedAddressId(null)
      setShowNewAddress(true)
    }
  }

  const handleSelectAddress = (addr) => {
    setSelectedAddressId(addr.id)
    setShowNewAddress(false)
    setForm((f) => ({
      ...f,
      shipping_address: addr.full_address,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
    }))
  }

  const handleAddNewAddress = () => {
    setSelectedAddressId(null)
    setShowNewAddress(true)
    setForm((f) => ({ ...f, shipping_address: '', city: '', state: '', pincode: '' }))
  }

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase()
    if (!code) return
    setCouponLoading(true)
    setCouponError(null)
    try {
      const res = await client.post('/api/coupons/validate', { code, subtotal })
      const data = res.data
      if (data.valid) {
        setCouponApplied(data)
        setCouponError(null)
      } else {
        setCouponApplied(null)
        setCouponError(data.message || 'Invalid coupon code.')
      }
    } catch {
      setCouponError('Failed to validate coupon. Please try again.')
      setCouponApplied(null)
    } finally {
      setCouponLoading(false)
    }
  }

  const handleRemoveCoupon = () => {
    setCouponApplied(null)
    setCouponCode('')
    setCouponError(null)
  }

  const launchRazorpay = (orderData, amountToPay, orderNumber) => {
    if (!window.Razorpay) {
      setError('Payment module failed to load. Please refresh and try again.')
      setPayProcessing(false)
      return
    }
    if (!razorpayKeyId) {
      setError('Payment is not configured. Please try again later.')
      setPayProcessing(false)
      return
    }

    const options = {
      key: razorpayKeyId,
      amount: Math.round(amountToPay * 100),
      currency: 'INR',
      name: 'Loopstitch Co.',
      description: `Order #${orderNumber}`,
      order_id: orderData.razorpay_order_id,
      handler: async function (response) {
        try {
          await client.post('/api/razorpay/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order_number: orderNumber,
          })
          // Save new address if logged in and using new address
          if (isAuthenticated && showNewAddress && form.shipping_address) {
            try {
              await addAddress({
                full_address: form.shipping_address,
                city: form.city,
                state: form.state,
                pincode: form.pincode,
                is_default: addresses.length === 0,
              })
            } catch { /* address save is non-critical */ }
          }
          clearCart()
          setPayProcessing(false)
          navigate('/order/confirm', {
            state: { order: { ...orderData, razorpay_order_id: response.razorpay_order_id, payment_already_verified: true } },
          })
        } catch {
          setError('Payment verification failed. Please contact support.')
          setPayProcessing(false)
        }
      },
      prefill: {
        name: form.customer_name,
        email: form.customer_email,
        contact: form.customer_phone,
      },
      theme: { color: '#FF3B5C' },
      modal: {
        ondismiss: function () {
          setError('Payment was cancelled. Your order has not been placed.')
          setPayProcessing(false)
        },
      },
    }

    const rzp = new window.Razorpay(options)
    rzp.on('payment.failed', function () {
      setError('Payment failed. Please try again.')
      setPayProcessing(false)
    })
    rzp.open()
  }

  const handleCheckoutClick = (e) => {
    e.preventDefault()
    setError(null)
    if (!form.customer_name || !form.customer_phone || !form.customer_email || !form.shipping_address || !form.city || !form.state || !form.pincode) {
      setError('Please fill in all required fields.')
      return
    }
    if (form.customer_phone.length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
      return
    }
    setShowPaymentModal(true)
  }

  const handlePaymentChoice = async (method) => {
    setShowPaymentModal(false)
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        ...form,
        payment_method: method,
        coupon_code: couponApplied?.code || couponCode.trim().toUpperCase() || undefined,
         items: items.map((i) => ({ product_id: i.productId, color_id: i.colorId || undefined, size: i.size, quantity: i.quantity })),
      }
      const res = await client.post('/api/orders', payload)
      const orderData = res.data.order

      let amountToPay = orderData.total
      if (method === 'cod') {
        amountToPay = orderData.cod_advance_paid
      }

      if (amountToPay > 0) {
        setSubmitting(false)
        setPayProcessing(true)
        try {
          const rpRes = await client.post('/api/razorpay/create-order', {
            amount: amountToPay,
            receipt: orderData.order_number,
          })
          launchRazorpay({ ...orderData, razorpay_order_id: rpRes.data.order_id }, amountToPay, orderData.order_number)
        } catch (err) {
          const detail = err.response?.data?.detail || 'Failed to initialize payment. Please try again.'
          setError(detail)
          setPayProcessing(false)
        }
        return
      }

      // Save new address if logged in and using new address (for zero-payment COD)
      if (isAuthenticated && showNewAddress && form.shipping_address) {
        try {
          await addAddress({
            full_address: form.shipping_address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            is_default: addresses.length === 0,
          })
        } catch { /* address save is non-critical */ }
      }
      clearCart()
      navigate('/order/confirm', { state: { order: orderData } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (payProcessing) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <p className="text-paper font-mono text-sm mb-6">Processing payment…</p>
        <p className="text-slate font-mono text-xs">Please complete the payment in the popup window. Do not close this page.</p>
      </div>
    )
  }

  const codAdvanceAmount = quote ? Math.round(quote.total * codAdvancePercent / 100 * 100) / 100 : 0
  const codBalanceAmount = quote ? Math.round((quote.total - codAdvanceAmount) * 100) / 100 : 0

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
      <h1 className="font-display text-3xl sm:text-4xl uppercase text-paper mb-8 sm:mb-10">Checkout</h1>

      <div className="grid md:grid-cols-3 gap-10">
        <form onSubmit={handleCheckoutClick} className="md:col-span-2 space-y-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Full name" name="customer_name" value={form.customer_name} onChange={handleChange} required />
            <Field label="Phone" name="customer_phone" value={form.customer_phone} onChange={handleChange} required maxLength={10} inputMode="numeric" />
          </div>
          <Field label="Email" name="customer_email" type="email" value={form.customer_email} onChange={handleChange} required />

          {/* Saved addresses (logged-in users only) */}
          {isAuthenticated && addresses.length > 0 && !showNewAddress && (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-2">Shipping address</p>
              <div className="space-y-2">
                {addresses.map((addr) => (
                  <label
                    key={addr.id}
                    className={`block border p-3 cursor-pointer transition-colors ${
                      selectedAddressId === addr.id
                        ? 'border-acid bg-acid/5'
                        : 'border-panel-2 hover:border-paper/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="saved_address"
                      checked={selectedAddressId === addr.id}
                      onChange={() => handleSelectAddress(addr)}
                      className="mr-2 accent-acid"
                    />
                    <span className="font-mono text-xs text-paper">{addr.full_address}</span>
                    <span className="font-mono text-[11px] text-slate ml-2">{addr.city} {addr.state} {addr.pincode}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={handleAddNewAddress}
                  className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline"
                >
                  + Add new address
                </button>
              </div>
            </div>
          )}

          {/* Address form — shown when no saved addresses or "Add new" clicked */}
          {(!isAuthenticated || addresses.length === 0 || showNewAddress) && (
            <>
              {isAuthenticated && addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setShowNewAddress(false); setSelectedAddressId(addresses[0]?.id || null); if (addresses[0]) handleSelectAddress(addresses[0]) }}
                  className="font-mono text-[11px] uppercase tracking-widest text-slate hover:text-paper"
                >
                  ← Use saved address
                </button>
              )}
              <Field label="Address" name="shipping_address" value={form.shipping_address} onChange={handleChange} required textarea />
              <div className="grid sm:grid-cols-3 gap-5">
                <Field label="City" name="city" value={form.city} onChange={handleChange} required />
                <Field label="State" name="state" value={form.state} onChange={handleChange} required />
                <Field label="Pincode" name="pincode" value={form.pincode} onChange={handleChange} required pattern="[0-9]{6}" title="Enter a valid 6-digit pincode" />
              </div>
            </>
          )}

          {error && (
            <div className="border border-riot bg-riot/10 text-riot text-sm font-mono px-4 py-3">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto bg-riot text-ink font-mono text-sm uppercase tracking-widest px-8 py-3.5 hover:bg-acid transition-colors disabled:opacity-60"
          >
            {submitting ? 'Placing order…' : 'Checkout'}
          </button>
        </form>

        <div className="h-fit border border-panel-2 p-6 space-y-3">
          {items.map((i) => (
             <div key={i.key} className="flex justify-between gap-3 text-xs font-mono text-paper/80">
               <span className="min-w-0 break-words">{i.name} × {i.quantity} ({i.size})</span>
               <span className="shrink-0">{formatINR(i.price * i.quantity)}</span>
            </div>
          ))}
          <div className="border-t border-panel-2 pt-3 flex justify-between text-sm text-paper/90">
            <span>Subtotal</span>
            <span className="font-mono">{formatINR(subtotal)}</span>
          </div>
          {quote && quote.discount > 0 && (
            <div className="flex justify-between text-sm text-acid">
              <span>Offer · {quote.offer_label}</span>
              <span className="font-mono">−{formatINR(quote.discount)}</span>
            </div>
          )}

          <div className="border-t border-panel-2 pt-3 mt-2 mb-1">
            <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-2">Coupon code</p>
            {couponApplied ? (
              <div className="flex items-center justify-between bg-acid/10 border border-acid/30 px-3 py-2">
                <span className="font-mono text-xs text-acid">{couponApplied.code} · {couponApplied.discount_percent}% off</span>
                <button onClick={handleRemoveCoupon} className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-riot ml-2 shrink-0">
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value); setCouponError(null) }}
                  placeholder="e.g. SUMMER20"
                  className="flex-1 bg-panel border border-panel-2 px-3 py-2 text-xs font-mono text-paper placeholder:text-slate-dim focus:border-acid outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                   className="font-mono text-[10px] uppercase tracking-widest text-acid border border-acid px-3 py-2.5 min-h-11 hover:bg-acid hover:text-ink transition-colors disabled:opacity-40 shrink-0"
                >
                  {couponLoading ? '…' : 'Apply'}
                </button>
              </div>
            )}
            {couponError && (
              <p className="font-mono text-[11px] text-riot mt-1">{couponError}</p>
            )}
          </div>

          {quote && quote.coupon_discount > 0 && (
            <div className="flex justify-between text-sm text-acid">
              <span>Coupon · {quote.coupon_code}</span>
              <span className="font-mono">−{formatINR(quote.coupon_discount)}</span>
            </div>
          )}

          {quote && (
            <>
              <div className="flex justify-between text-sm text-paper/90">
                <span>Delivery</span>
                <span className="font-mono">{quote.shipping_fee === 0 ? 'FREE' : formatINR(quote.shipping_fee)}</span>
              </div>
              <div className="border-t border-panel-2 pt-3 flex justify-between text-base text-paper">
                <span>Total to pay</span>
                <span className="font-mono">{formatINR(quote.total)}</span>
              </div>
            </>
          )}
          {!quote && <p className="font-mono text-[11px] text-slate">Delivery calculated with your order</p>}
        </div>
      </div>

      {/* Payment Method Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPaymentModal(false)} />
          <div className="relative bg-panel border border-panel-2 p-6 sm:p-8 w-full max-w-md space-y-5">
            <h2 className="font-display text-2xl uppercase text-paper">Choose payment</h2>

            <div className="border border-panel-2 p-4 space-y-1">
              <p className="font-mono text-xs text-slate">Order total</p>
              <p className="font-mono text-lg text-paper">{formatINR(quote?.total || 0)}</p>
            </div>

            <button
              onClick={() => handlePaymentChoice('online')}
              className="w-full bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-4 hover:bg-acid transition-colors text-left"
            >
              <span className="block">Pay now — {formatINR(quote?.total || 0)}</span>
              <span className="block text-[11px] font-normal normal-case mt-1 opacity-70">Card / UPI / Wallet via Razorpay</span>
            </button>

            {codEnabled && (
              <button
                onClick={() => handlePaymentChoice('cod')}
                className="w-full border border-panel-2 text-paper font-mono text-sm uppercase tracking-widest px-6 py-4 hover:border-paper transition-colors text-left"
              >
                <span className="block">Cash on Delivery</span>
                <span className="block text-[11px] font-normal normal-case mt-1 opacity-70">
                  Pay {formatINR(codAdvanceAmount)} online now, {formatINR(codBalanceAmount)} on delivery
                </span>
              </button>
            )}

            <button
              onClick={() => setShowPaymentModal(false)}
              className="font-mono text-[11px] uppercase tracking-widest text-slate hover:text-paper"
            >
              ← Back to form
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, textarea, ...props }) {
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">{label}</span>
      <Tag
        {...props}
        rows={textarea ? 4 : undefined}
        className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none transition-colors"
      />
    </label>
  )
}
