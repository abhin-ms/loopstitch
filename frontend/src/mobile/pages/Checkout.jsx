import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { loadRazorpay } from '../../utils/razorpay'
import { useCart } from '../../context/CartContext'
import { useCustomerAuth } from '../../context/CustomerAuthContext'
import useQuote from '../../hooks/useQuote'
import { formatINR } from '../../utils/format'

function normalizePhone(value) {
  return value.replace(/\D/g, '').slice(0, 10)
}

export default function MobileCheckout() {
  const navigate = useNavigate()
  const { items, subtotal, clearCart } = useCart()
  const { customer, isAuthenticated, addresses, loadAddresses, addAddress } = useCustomerAuth()
  const quote = useQuote(items)

  const [form, setForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', shipping_address: '', city: '', state: '', pincode: '' })
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [codEnabled, setCodEnabled] = useState(false)
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payProcessing, setPayProcessing] = useState(false)
  const [error, setError] = useState(null)
  const [addressesLoaded, setAddressesLoaded] = useState(false)

  // Razorpay is loaded on demand (no longer in index.html)
  useEffect(() => { loadRazorpay() }, [])

  useEffect(() => {
    client.get('/api/settings/checkout').then((res) => {
      setCodEnabled(res.data.cod_enabled)
      setPaymentMethod(res.data.cod_enabled ? 'cod' : 'online')
      setRazorpayKeyId(res.data.razorpay_key_id || '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !customer) return
    setForm((f) => ({
      ...f,
      customer_name: f.customer_name || customer.name || '',
      customer_email: f.customer_email || customer.email || '',
      customer_phone: f.customer_phone || customer.phone || '',
    }))
    if (!addressesLoaded) {
      loadAddresses().then((addrs) => {
        setAddressesLoaded(true)
        const def = addrs?.find((a) => a.is_default) || addrs?.[0]
        if (def) {
          setForm((f) => ({ ...f, shipping_address: def.full_address, city: def.city, state: def.state, pincode: def.pincode }))
        }
      })
    }
  }, [isAuthenticated, customer, addressesLoaded, loadAddresses])

  if (items.length === 0) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--ls-text-muted)' }}>Your cart is empty.</p>
        <button className="ls-btn-outline" style={{ width: 'auto', marginTop: 14 }} onClick={() => navigate('/app/shop')}>
          Browse the shop
        </button>
      </div>
    )
  }

  const handleChange = (name) => (e) => {
    const value = name === 'customer_phone' ? normalizePhone(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [name]: value }))
  }

  const invalid = !(form.customer_name && form.customer_phone && form.customer_email && form.shipping_address && form.city && form.state && form.pincode)

  const saveAddressIfNeeded = async () => {
    if (isAuthenticated && form.shipping_address) {
      try {
        await addAddress({ full_address: form.shipping_address, city: form.city, state: form.state, pincode: form.pincode, is_default: addresses.length === 0 })
      } catch { /* non-critical */ }
    }
  }

  const launchRazorpay = (orderData, amountToPay, orderNumber) => {
    if (!window.Razorpay || !razorpayKeyId) {
      setError('Payment is not available right now. Please try again later.')
      setPayProcessing(false)
      return
    }
    const rzp = new window.Razorpay({
      key: razorpayKeyId,
      amount: Math.round(amountToPay * 100),
      currency: 'INR',
      name: 'Loopstitch Co.',
      description: `Order #${orderNumber}`,
      order_id: orderData.razorpay_order_id,
      handler: async (response) => {
        try {
          await client.post('/api/razorpay/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order_number: orderNumber,
          })
          await saveAddressIfNeeded()
          clearCart()
          setPayProcessing(false)
          navigate('/app/order/confirm', { state: { order: { ...orderData, razorpay_order_id: response.razorpay_order_id, payment_already_verified: true } } })
        } catch {
          setError('Payment verification failed. Please contact support.')
          setPayProcessing(false)
        }
      },
      prefill: { name: form.customer_name, email: form.customer_email, contact: form.customer_phone },
      theme: { color: '#ec3013' },
      modal: { ondismiss: () => { setError('Payment was cancelled. Your order has not been placed.'); setPayProcessing(false) } },
    })
    rzp.on('payment.failed', () => { setError('Payment failed. Please try again.'); setPayProcessing(false) })
    rzp.open()
  }

  const handlePlaceOrder = async () => {
    if (invalid) return
    if (form.customer_phone.length !== 10) { setError('Please enter a valid 10-digit phone number.'); return }
    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        payment_method: paymentMethod,
        items: items.map((i) => ({ product_id: i.productId, color_id: i.colorId || undefined, size: i.size, quantity: i.quantity })),
      }
      const res = await client.post('/api/orders', payload)
      const orderData = res.data.order
      const amountToPay = paymentMethod === 'cod' ? orderData.cod_advance_paid : orderData.total

      if (amountToPay > 0) {
        setSubmitting(false)
        setPayProcessing(true)
        const rpRes = await client.post('/api/razorpay/create-order', { amount: amountToPay, receipt: orderData.order_number })
        launchRazorpay({ ...orderData, razorpay_order_id: rpRes.data.order_id }, amountToPay, orderData.order_number)
        return
      }

      await saveAddressIfNeeded()
      clearCart()
      navigate('/app/order/confirm', { state: { order: orderData } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
      setPayProcessing(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (payProcessing) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, marginBottom: 10 }}>Processing payment…</p>
        <p style={{ fontSize: 12, color: 'var(--ls-text-muted)' }}>Complete the payment in the popup. Do not close this page.</p>
      </div>
    )
  }

  const total = quote?.total ?? subtotal

  return (
    <div style={{ padding: '18px 16px' }}>
      <p className="ls-field-label">Full name</p>
      <input className="ls-input" style={{ marginBottom: 14 }} value={form.customer_name} onChange={handleChange('customer_name')} placeholder="Your name" />
      <p className="ls-field-label">Phone</p>
      <input className="ls-input" style={{ marginBottom: 14 }} value={form.customer_phone} onChange={handleChange('customer_phone')} placeholder="10-digit number" inputMode="numeric" maxLength={10} />
      <p className="ls-field-label">Email</p>
      <input className="ls-input" style={{ marginBottom: 14 }} type="email" value={form.customer_email} onChange={handleChange('customer_email')} placeholder="you@example.com" />
      <p className="ls-field-label">Delivery address</p>
      <textarea className="ls-textarea" style={{ marginBottom: 14 }} value={form.shipping_address} onChange={handleChange('shipping_address')} placeholder="House, street, city, pincode" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        <input className="ls-input" value={form.city} onChange={handleChange('city')} placeholder="City" />
        <input className="ls-input" value={form.state} onChange={handleChange('state')} placeholder="State" />
      </div>
      <input className="ls-input" style={{ marginBottom: 20 }} value={form.pincode} onChange={handleChange('pincode')} placeholder="Pincode" inputMode="numeric" maxLength={6} />

      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
        Payment
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {codEnabled && (
          <button className={`ls-option${paymentMethod === 'cod' ? ' active' : ''}`} onClick={() => setPaymentMethod('cod')}>
            Cash / UPI on delivery
          </button>
        )}
        <button className={`ls-option${paymentMethod === 'online' ? ' active' : ''}`} onClick={() => setPaymentMethod('online')}>
          Pay online
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--ls-divider)', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--ls-text-muted)' }}>Total</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ls-accent)' }}>{formatINR(total)}</span>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--ls-accent)', marginBottom: 14 }}>{error}</p>}

      <button className="ls-btn-primary" disabled={invalid || submitting} onClick={handlePlaceOrder}>
        {submitting ? 'Placing order…' : 'Place order →'}
      </button>
    </div>
  )
}
