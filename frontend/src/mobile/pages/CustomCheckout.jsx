import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { loadRazorpay } from '../../utils/razorpay'
import { useCustomerAuth } from '../../context/CustomerAuthContext'
import { formatINR } from '../../utils/format'

function normalizePhone(value) {
  return value.replace(/\D/g, '').slice(0, 10)
}

export default function MobileCustomCheckout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { customer, isAuthenticated } = useCustomerAuth()

  const { selections, designs, quote: initialQuote } = location.state || {}

  const [form, setForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', shipping_address: '', city: '', state: '', pincode: '' })
  const [paymentMethod, setPaymentMethod] = useState('online')
  const [acceptedNoRefund, setAcceptedNoRefund] = useState(false)
  const [codEnabled, setCodEnabled] = useState(false)
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payProcessing, setPayProcessing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/app/login', { state: { redirectTo: '/app/customize' }, replace: true })
    }
  }, [isAuthenticated, navigate])

  // Razorpay is loaded on demand (no longer in index.html)
  useEffect(() => { loadRazorpay() }, [])

  useEffect(() => {
    client.get('/api/settings/checkout').then((res) => {
      setCodEnabled(res.data.cod_enabled)
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
  }, [isAuthenticated, customer])

  if (!selections) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--ls-text-muted)', marginBottom: 14 }}>Start a custom order first.</p>
        <button className="ls-btn-outline" style={{ width: 'auto' }} onClick={() => navigate('/app/customize')}>← Back to custom studio</button>
      </div>
    )
  }

  const handleChange = (name) => (e) => {
    const value = name === 'customer_phone' ? normalizePhone(e.target.value) : e.target.value
    setForm((f) => ({ ...f, [name]: value }))
  }

  const invalid = !(form.customer_name && form.customer_phone && form.customer_email && form.shipping_address && form.city && form.state && form.pincode)

  const launchRazorpay = (order, amountToPay) => {
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
      description: `Custom order #${order.order_number}`,
      order_id: order.razorpay_order_id,
      handler: async (response) => {
        try {
          await client.post('/api/razorpay/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order_number: order.order_number,
          })
          setPayProcessing(false)
          navigate('/app/order/confirm', { state: { order: { ...order, razorpay_order_id: response.razorpay_order_id, payment_already_verified: true } } })
        } catch {
          setError('Payment verification failed. Please contact support.')
          setPayProcessing(false)
        }
      },
      prefill: { name: form.customer_name, email: form.customer_email, contact: form.customer_phone },
      theme: { color: '#ec3013' },
      modal: { ondismiss: () => { setError('Payment was cancelled. Your order remains pending.'); setPayProcessing(false) } },
    })
    rzp.on('payment.failed', () => { setError('Payment failed. Please try again.'); setPayProcessing(false) })
    rzp.open()
  }

  const handleSubmit = async () => {
    if (invalid) return
    if (form.customer_phone.length !== 10) { setError('Please enter a valid 10-digit phone number.'); return }
    setError(null)
    setSubmitting(true)
    try {
      const res = await client.post('/api/custom/order', {
        ...form,
        payment_method: paymentMethod,
        colors: selections,
        designs: designs.map(({ file_url, file_name, file_type, print_area, notes }) => ({ file_url, file_name, file_type, print_area, notes: notes || '' })),
      })
      const order = res.data
      const amountToPay = paymentMethod === 'cod' ? order.cod_advance_paid : order.total

      if (amountToPay > 0) {
        setSubmitting(false)
        setPayProcessing(true)
        const rpRes = await client.post('/api/razorpay/create-order', { amount: amountToPay, receipt: order.order_number })
        launchRazorpay({ ...order, razorpay_order_id: rpRes.data.order_id }, amountToPay)
        return
      }

      navigate('/app/order/confirm', { state: { order } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to place order. Please try again.')
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
        <button className={`ls-option${paymentMethod === 'online' ? ' active' : ''}`} onClick={() => setPaymentMethod('online')}>Pay online</button>
        {codEnabled && (
          <button className={`ls-option${paymentMethod === 'cod' ? ' active' : ''}`} onClick={() => setPaymentMethod('cod')}>Cash on delivery</button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--ls-divider)', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--ls-text-muted)' }}>Total</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ls-accent)' }}>{formatINR(initialQuote?.total ?? 0)}</span>
      </div>

      <div style={{ border: '2px solid var(--ls-accent)', padding: 14, marginBottom: 16 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ls-accent)' }}>Custom orders are final</p>
        <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.5 }}>
          Custom-printed tees are made to order, so they <strong>cannot be returned, exchanged or refunded</strong>, including if you cancel. If your order arrives damaged or with a printing fault on our side, we reprint it free.
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={acceptedNoRefund} onChange={(e) => setAcceptedNoRefund(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1 }} />
          I understand this custom order cannot be returned or refunded.
        </label>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--ls-accent)', marginBottom: 14 }}>{error}</p>}

      <button className="ls-btn-primary" disabled={invalid || submitting || !acceptedNoRefund} onClick={handleSubmit}>
        {submitting ? 'Placing order…' : 'Place custom order →'}
      </button>
    </div>
  )
}
