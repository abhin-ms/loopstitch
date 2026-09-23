import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { useCustomerAuth } from '../context/CustomerAuthContext'
import Loader from '../components/Loader'
import TshirtCustomizer, { BODY_FRONT, COLLAR_FRONT, NECKHOLE_FRONT, getStageBg, getLuminance } from '../components/custom/TshirtCustomizer'
import PriceSummary from '../components/custom/PriceSummary'
import LoginModal from '../components/LoginModal'

const SIZES = ['S', 'M', 'L', 'XL', 'XXL']

function TshirtPreview({ colorHex }) {
  const hex = colorHex || '#1A1A1A'
  const textFill = getLuminance(hex) < 0.45 ? '#ffffff' : '#000000'
  return (
    <div className="relative w-full max-w-sm mx-auto aspect-[5/6.2] border border-panel-2 flex items-center justify-center overflow-hidden p-6" style={{ backgroundColor: getStageBg(hex) }}>
      <svg viewBox="0 0 500 640" className="relative w-full h-full" style={{ filter: 'drop-shadow(0 18px 22px rgba(0,0,0,0.35))' }} role="img" aria-label="Blank t-shirt preview">
        <defs>
          <clipPath id="bodyclip-preview"><path d={BODY_FRONT} /></clipPath>
          <radialGradient id="light-preview" cx="38%" cy="10%" r="80%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="edge-preview" cx="50%" cy="42%" r="72%">
            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
          </radialGradient>
        </defs>
        <path d={BODY_FRONT} fill={hex} />
        <text x="250" y="360" textAnchor="middle" fill={textFill} fillOpacity="0.35" fontFamily="JetBrains Mono, monospace" fontSize="14" fontWeight="600" letterSpacing="1">YOUR DESIGN</text>
        <path d={BODY_FRONT} fill="url(#light-preview)" style={{ mixBlendMode: 'soft-light', pointerEvents: 'none' }} clipPath="url(#bodyclip-preview)" />
        <path d={BODY_FRONT} fill="url(#edge-preview)" style={{ mixBlendMode: 'multiply', pointerEvents: 'none' }} clipPath="url(#bodyclip-preview)" />
        <path d={NECKHOLE_FRONT} fill="#000" opacity="0.35" />
        <path d={COLLAR_FRONT} fill={hex} />
        <path d={COLLAR_FRONT} fill="#000" opacity="0.08" style={{ mixBlendMode: 'multiply' }} />
      </svg>
      <span className="absolute bottom-3 left-3 font-mono text-[10px] uppercase tracking-widest text-slate">Blank tee preview</span>
    </div>
  )
}

export default function Customize() {
  const navigate = useNavigate()
  const { customer, isAuthenticated } = useCustomerAuth()
  const [config, setConfig] = useState(null)
  const [colors, setColors] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [selections, setSelections] = useState([])
  const [designs, setDesigns] = useState([])
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [form, setForm] = useState({
    customer_name: '', customer_email: '', customer_phone: '',
    shipping_address: '', city: '', state: '', pincode: '',
  })
  const [paymentMethod, setPaymentMethod] = useState('online')
  const [acceptedNoRefund, setAcceptedNoRefund] = useState(false)
  const [codEnabled, setCodEnabled] = useState(false)
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payProcessing, setPayProcessing] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    Promise.all([
      client.get('/api/custom/config'),
      client.get('/api/custom/colors'),
      client.get('/api/settings/checkout'),
    ]).then(([configRes, colorsRes, checkoutRes]) => {
      setConfig(configRes.data)
      setColors(colorsRes.data)
      setCodEnabled(checkoutRes.data.cod_enabled)
      setRazorpayKeyId(checkoutRes.data.razorpay_key_id || '')
      setLoading(false)
    }).catch(() => {
      setPageError('Failed to load custom t-shirt configuration.')
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (isAuthenticated && customer) {
      setForm((current) => ({
        ...current,
        customer_name: current.customer_name || customer.name || '',
        customer_email: current.customer_email || customer.email || '',
        customer_phone: current.customer_phone || customer.phone || '',
      }))
    }
  }, [isAuthenticated, customer])

  const selectedQuantity = selections.reduce(
    (total, selection) => total + selection.sizes.reduce((sum, size) => sum + size.quantity, 0), 0,
  )
  const minQty = config?.min_order_qty || 1
  const belowMinimum = selectedQuantity > 0 && selectedQuantity < minQty
  const canProceedFromOrder = selectedQuantity > 0 && selectedQuantity >= minQty

  useEffect(() => {
    if (selectedQuantity < (config?.min_order_qty || 1)) {
      setQuote(null)
      return
    }
    setQuoteLoading(true)
    const timeout = setTimeout(() => {
      client.post('/api/custom/quote', { colors: selections })
        .then((res) => setQuote(res.data))
        .catch(() => setQuote(null))
        .finally(() => setQuoteLoading(false))
    }, 250)
    return () => clearTimeout(timeout)
  }, [selections, selectedQuantity, config?.min_order_qty])

  const toggleColor = (colorId) => {
    if (selections.some((selection) => selection.color_id === colorId)) {
      setSelections((current) => current.filter((selection) => selection.color_id !== colorId))
      return
    }
    setSelections((current) => [...current, {
      color_id: colorId,
      sizes: SIZES.map((size) => ({ size, quantity: 0 })),
    }])
  }

  const updateQuantity = (colorId, size, value) => {
    const quantity = Math.max(0, Number.parseInt(value, 10) || 0)
    setSelections((current) => current.map((selection) => (
      selection.color_id === colorId
        ? { ...selection, sizes: selection.sizes.map((item) => item.size === size ? { ...item, quantity } : item) }
        : selection
    )))
  }

  const launchRazorpay = (orderData, amountToPay) => {
    if (!window.Razorpay) {
      setSubmitError('Payment module failed to load. Please refresh and try again.')
      setPayProcessing(false)
      return
    }
    if (!razorpayKeyId) {
      setSubmitError('Payment is not configured. Please try again later.')
      setPayProcessing(false)
      return
    }

    const razorpay = new window.Razorpay({
      key: razorpayKeyId,
      amount: Math.round(amountToPay * 100),
      currency: 'INR',
      name: 'Loopstitch Co.',
      description: `Custom order #${orderData.order_number}`,
      order_id: orderData.razorpay_order_id,
      handler: async (response) => {
        try {
          await client.post('/api/razorpay/verify', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order_number: orderData.order_number,
          })
          navigate('/order/confirm', {
            state: {
              order: {
                ...orderData,
                status: 'paid',
                razorpay_order_id: response.razorpay_order_id,
                payment_already_verified: true,
              },
            },
          })
        } catch {
          setSubmitError('Payment verification failed. Please contact support.')
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
        ondismiss: () => {
          setSubmitError('Payment was cancelled. Your order remains pending; please contact support if you were charged.')
          setPayProcessing(false)
        },
      },
    })
    razorpay.on('payment.failed', () => {
      setSubmitError('Payment failed. Please try again.')
      setPayProcessing(false)
    })
    razorpay.open()
  }

  const handleSubmitOrder = async (event) => {
    event.preventDefault()
    if (!isAuthenticated) {
      setLoginOpen(true)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await client.post('/api/custom/order', {
        ...form,
        payment_method: paymentMethod,
        colors: selections,
        designs: designs.map(({ file_url, file_name, file_type, print_area, notes }) => ({
          file_url, file_name, file_type, print_area, notes: notes || '',
        })),
      })
      const order = response.data
      const amountToPay = paymentMethod === 'cod' ? order.cod_advance_paid : order.total
      if (amountToPay > 0) {
        setSubmitting(false)
        setPayProcessing(true)
        const razorpayOrder = await client.post('/api/razorpay/create-order', {
          amount: amountToPay,
          receipt: order.order_number,
        })
        launchRazorpay({ ...order, razorpay_order_id: razorpayOrder.data.order_id }, amountToPay)
        return
      }
      navigate('/order/confirm', { state: { order } })
    } catch (error) {
      setSubmitError(error.response?.data?.detail || 'Failed to place order. Please try again.')
      setPayProcessing(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <Loader label="Loading custom t-shirt" />
  if (payProcessing) return (
    <div className="max-w-3xl mx-auto px-5 py-24 text-center">
      <p className="text-paper font-mono text-sm mb-6">Processing payment...</p>
      <p className="text-slate font-mono text-xs">Complete the payment in the Razorpay window. Do not close this page.</p>
    </div>
  )
  if (pageError) return <div className="max-w-3xl mx-auto px-5 py-24 text-center"><p className="text-riot font-mono text-sm">{pageError}</p></div>
  if (!config || !config.is_active) return <div className="max-w-3xl mx-auto px-5 py-24 text-center"><p className="text-slate font-mono text-sm">Custom t-shirt printing is currently unavailable.</p></div>

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
      <div className="max-w-2xl mb-10">
        <p className="font-mono text-xs text-acid tracking-[0.2em] uppercase mb-3">Custom studio</p>
        <h1 className="font-display text-4xl sm:text-6xl uppercase text-paper leading-none">Make it yours.</h1>
        <p className="font-mono text-xs sm:text-sm text-slate mt-4 leading-relaxed">Pick your colors and sizes, then send us your artwork.</p>
      </div>

      <div className="flex gap-2 mb-10" aria-label="Customization steps">
        {['Order', 'Design', 'Payment'].map((label, index) => (
          <div key={label} className="flex-1">
            <div className={`h-1 ${index + 1 <= step ? 'bg-acid' : 'bg-panel-2'}`} />
            <span className={`font-mono text-[10px] uppercase tracking-widest mt-2 block ${index + 1 === step ? 'text-acid' : 'text-slate'}`}>{label}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="grid lg:grid-cols-[1fr_20rem] gap-8 items-start">
          <div>
            <p className="font-mono text-xs text-slate uppercase tracking-widest mb-2">Step 01 / Order</p>
            <h2 className="font-display text-3xl sm:text-4xl uppercase text-paper mb-1">Pick colors &amp; sizes.</h2>
            <p className="text-sm text-slate leading-relaxed mb-6">Tap a color to add it, then set a quantity for each size you need. Add as many colors as you like.</p>

            <div className="flex flex-wrap gap-3 mb-6">
              {colors.map((color) => {
                const selected = selections.some((selection) => selection.color_id === color.id)
                return (
                  <button key={color.id} type="button" onClick={() => toggleColor(color.id)}
                    className={`flex items-center gap-2 border px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${selected ? 'border-acid text-acid bg-acid/5' : 'border-panel-2 text-slate hover:border-paper'}`}>
                    <span className="w-4 h-4 rounded-full border border-panel-2" style={{ backgroundColor: color.hex_code }} />
                    {color.name}
                  </button>
                )
              })}
            </div>

            <div className="space-y-5">
              {selections.map((selection) => {
                const color = colors.find((item) => item.id === selection.color_id)
                const colorTotal = selection.sizes.reduce((sum, item) => sum + item.quantity, 0)
                return (
                  <div key={selection.color_id} className="border border-panel-2 p-5 sm:p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <span className="w-6 h-6 rounded-full border border-panel-2" style={{ backgroundColor: color?.hex_code }} />
                      <h3 className="font-display text-2xl uppercase text-paper">{color?.name}</h3>
                      {colorTotal > 0 && <span className="font-mono text-[11px] text-acid">{colorTotal} pcs</span>}
                      <button type="button" onClick={() => toggleColor(selection.color_id)} className="ml-auto font-mono text-[10px] uppercase tracking-widest text-slate hover:text-riot">Remove</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {selection.sizes.map((item) => (
                        <label key={item.size} className="block">
                          <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-2">Size {item.size}</span>
                          <input type="number" min="0" step="1" value={item.quantity}
                            onChange={(event) => updateQuantity(selection.color_id, item.size, event.target.value)}
                            className="w-full bg-panel border border-panel-2 px-3 py-3 text-paper font-mono focus:border-acid outline-none" />
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            {selections.length === 0 && <p className="border border-dashed border-panel-2 p-8 text-center font-mono text-xs text-slate">Tap a color above to start building your order.</p>}
          </div>

          <div className="lg:sticky lg:top-24 space-y-6">
            <TshirtPreview colorHex={(colors.find((c) => c.id === selections[0]?.color_id) || colors[0])?.hex_code} />
            {selectedQuantity >= minQty ? (
              <PriceSummary quote={quote} quoteLoading={quoteLoading} totalPieces={selectedQuantity} />
            ) : (
              <div className="border border-panel-2 p-6 space-y-2">
                <div className="flex justify-between font-mono text-xs text-slate">
                  <span>{selectedQuantity} piece{selectedQuantity === 1 ? '' : 's'} so far</span>
                  <span>₹{(selectedQuantity * Number(config.base_price)).toLocaleString('en-IN')} est.</span>
                </div>
                {belowMinimum && (
                  <p className="font-mono text-[11px] text-riot">Add {minQty - selectedQuantity} more to meet the {minQty}-piece minimum.</p>
                )}
                {selectedQuantity === 0 && (
                  <p className="font-mono text-[11px] text-slate">₹{Number(config.base_price).toLocaleString('en-IN')} per piece before volume discounts.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && <TshirtCustomizer colors={colors} selections={selections} designs={designs} setDesigns={setDesigns} />}

      {step === 3 && (
        <form onSubmit={handleSubmitOrder}>
          <button type="button" onClick={() => setStep(2)} className="mb-6 font-mono text-xs uppercase tracking-widest text-slate hover:text-paper underline">
            ← Back to design
          </button>
          <div className="grid lg:grid-cols-[1fr_20rem] gap-8 items-start">
            <div>
              <p className="font-mono text-xs text-slate uppercase tracking-widest mb-2">Step 03 / Payment</p>
              <h2 className="font-display text-3xl sm:text-4xl uppercase text-paper mb-6">Review and pay.</h2>
              <div className="border border-panel-2 p-6 space-y-5">
                <h3 className="font-mono text-xs uppercase tracking-widest text-acid">Shipping details</h3>
                {[
                  ['customer_name', 'Full name', 'text'], ['customer_email', 'Email', 'email'], ['customer_phone', 'Phone', 'tel'],
                  ['shipping_address', 'Address', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['pincode', 'Pincode', 'text'],
                ].map(([name, label, type]) => (
                  <label key={name} className="block">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">{label}</span>
                    <input type={type} name={name} value={form[name]} required
                      onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
                      className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
                  </label>
                ))}
              </div>
              <div className="border border-panel-2 p-6 mt-6">
                <h3 className="font-mono text-xs uppercase tracking-widest text-acid mb-4">Payment method</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button type="button" onClick={() => setPaymentMethod('online')} className={`p-4 border text-left font-mono text-xs uppercase tracking-widest transition-colors ${paymentMethod === 'online' ? 'border-acid text-acid' : 'border-panel-2 text-slate'}`}>
                    Online payment
                    <span className="block normal-case tracking-normal mt-2 text-[11px] opacity-70">UPI, cards and wallets via Razorpay</span>
                  </button>
                  {codEnabled && <button type="button" onClick={() => setPaymentMethod('cod')} className={`p-4 border text-left font-mono text-xs uppercase tracking-widest transition-colors ${paymentMethod === 'cod' ? 'border-acid text-acid' : 'border-panel-2 text-slate'}`}>
                    Cash on delivery
                    <span className="block normal-case tracking-normal mt-2 text-[11px] opacity-70">Advance payment may apply</span>
                  </button>}
                </div>
              </div>
              <div className="mt-6 border border-riot/60 bg-riot/5 p-4">
                <p className="font-mono text-[11px] uppercase tracking-widest text-riot mb-1">Custom orders are final</p>
                <p className="text-sm text-paper/80 leading-relaxed">Custom-printed tees are made to order from your design, so they <strong className="text-paper">cannot be returned, exchanged or refunded</strong>, including if you cancel. If your order arrives damaged or with a printing fault on our side, we reprint it free. <a href="/privacy#returns" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-acid">Return policy</a></p>
                <label className="flex items-start gap-2.5 mt-3 cursor-pointer text-sm text-paper">
                  <input type="checkbox" checked={acceptedNoRefund} onChange={(e) => setAcceptedNoRefund(e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--color-acid)]" required />
                  I understand this custom order cannot be returned or refunded.
                </label>
              </div>
              {submitError && <p className="text-riot font-mono text-xs mt-4">{submitError}</p>}
            </div>
            <PriceSummary quote={quote} quoteLoading={quoteLoading} totalPieces={selectedQuantity} />
          </div>
          <button type="submit" disabled={submitting || !quote || !acceptedNoRefund}
            className="w-full mt-8 py-4 bg-acid text-ink font-mono text-xs uppercase tracking-widest hover:bg-acid/90 disabled:opacity-40 transition-colors">
            {submitting ? 'Preparing order...' : paymentMethod === 'online' ? 'Continue to Razorpay' : 'Place custom order'}
          </button>
        </form>
      )}

      {step < 3 && (
        <div className="flex gap-3 mt-8">
          {step > 1 && <button type="button" onClick={() => setStep(step - 1)} className="flex-1 py-3 border border-panel-2 text-slate font-mono text-xs uppercase tracking-widest hover:border-paper transition-colors">Back</button>}
          <button type="button" disabled={step === 1 && !canProceedFromOrder}
            onClick={() => setStep(step + 1)} className="flex-1 py-3 bg-acid text-ink font-mono text-xs uppercase tracking-widest hover:bg-acid/90 disabled:opacity-40 transition-colors">
            {step === 2 ? 'Review and pay' : 'Continue'}
          </button>
        </div>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={() => setLoginOpen(false)} />
    </div>
  )
}
