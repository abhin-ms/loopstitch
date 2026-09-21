import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { formatINR } from '../../utils/format'
import { UploadIcon } from '../icons'
import StitchLoader from '../components/StitchLoader'

const SIZES = ['S', 'M', 'L', 'XL', 'XXL']

export default function MobileCustomize() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [config, setConfig] = useState(null)
  const [colors, setColors] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState(null)

  const [colorId, setColorId] = useState(null)
  const [sizes, setSizes] = useState(SIZES.map((size) => ({ size, quantity: 0 })))
  const [design, setDesign] = useState(null) // { file_url, file_name, file_type }
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [notes, setNotes] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  useEffect(() => {
    Promise.all([client.get('/api/custom/config'), client.get('/api/custom/colors')])
      .then(([configRes, colorsRes]) => {
        setConfig(configRes.data)
        setColors(colorsRes.data)
        setColorId(colorsRes.data[0]?.id ?? null)
      })
      .catch(() => setPageError('Custom t-shirt printing is currently unavailable.'))
      .finally(() => setLoading(false))
  }, [])

  const totalQty = sizes.reduce((sum, s) => sum + s.quantity, 0)
  const minQty = config?.min_order_qty || 1

  useEffect(() => {
    if (totalQty < minQty || colorId == null) { setQuote(null); return }
    setQuoteLoading(true)
    const timeout = setTimeout(() => {
      client.post('/api/custom/quote', { colors: [{ color_id: colorId, sizes }] })
        .then((res) => setQuote(res.data))
        .catch(() => setQuote(null))
        .finally(() => setQuoteLoading(false))
    }, 250)
    return () => clearTimeout(timeout)
  }, [sizes, totalQty, minQty, colorId])

  const updateQty = (size, delta) => {
    setSizes((prev) => prev.map((s) => (s.size === size ? { ...s, quantity: Math.max(0, s.quantity + delta) } : s)))
  }

  const handleFile = (file) => {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('print_area', 'front')
    client.post('/api/custom/designs/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((res) => setDesign({ file_url: res.data.file_url, file_name: res.data.file_name, file_type: res.data.file_type, print_area: 'front', notes: '' }))
      .catch((err) => setUploadError(err.response?.data?.detail || 'Upload failed'))
      .finally(() => setUploading(false))
  }

  if (loading) return <StitchLoader label="Loading custom studio" />
  if (pageError || !config?.is_active) {
    return <p style={{ padding: 24, fontSize: 13, color: 'var(--ls-text-muted)', textAlign: 'center' }}>{pageError || 'Custom t-shirt printing is currently unavailable.'}</p>
  }

  const canContinue = totalQty >= minQty && !!design && !!colorId

  const handleContinue = () => {
    if (!canContinue) return
    navigate('/app/customize/checkout', {
      state: {
        selections: [{ color_id: colorId, sizes }],
        designs: [{ ...design, notes }],
        quote,
      },
    })
  }

  return (
    <div style={{ padding: '18px 16px 100px' }}>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--ls-text-muted)' }}>
        Upload your artwork, logo or photo — printed on a premium tee.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }}
      />
      <div style={{ border: '1.5px dashed var(--ls-divider)', padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ color: 'var(--ls-text-muted)' }}><UploadIcon /></span>
        <span style={{ fontSize: 12, color: 'var(--ls-text-muted)', textAlign: 'center' }}>
          {uploading ? 'Uploading…' : design ? design.file_name : 'PNG, JPG or PDF · up to 10MB'}
        </span>
        <button className="ls-btn-outline" style={{ width: 'auto' }} onClick={() => fileInputRef.current?.click()}>
          {design ? 'Replace file' : 'Choose file'}
        </button>
      </div>
      {uploadError && <p style={{ fontSize: 11, color: 'var(--ls-accent)', marginTop: -12, marginBottom: 16 }}>{uploadError}</p>}

      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
        Color
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {colors.map((c) => (
          <button
            key={c.id}
            className={`ls-chip${colorId === c.id ? ' active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setColorId(c.id)}
          >
            <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1px solid var(--ls-divider)', background: c.hex_code }} />
            {c.name}
          </button>
        ))}
      </div>

      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
        Sizes &amp; quantity · min {minQty} pieces
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {sizes.map((s) => (
          <div key={s.size} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--ls-divider)', padding: '8px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{s.size}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="ls-stepper-btn" disabled={s.quantity <= 0} onClick={() => updateQty(s.size, -1)}>−</button>
              <span style={{ fontSize: 12, minWidth: 14, textAlign: 'center' }}>{s.quantity}</span>
              <button className="ls-stepper-btn" onClick={() => updateQty(s.size, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
        Notes for the print team
      </p>
      <textarea
        className="ls-textarea"
        style={{ marginBottom: 20 }}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Placement, size, anything to flag..."
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--ls-divider)', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--ls-text-muted)' }}>
          {totalQty < minQty ? `${totalQty} of ${minQty} min. pieces` : 'Estimated price'}
        </span>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ls-accent)' }}>
          {quoteLoading ? '…' : quote ? formatINR(quote.total) : totalQty > 0 ? formatINR(totalQty * Number(config.base_price)) : '—'}
        </span>
      </div>

      <button className="ls-btn-primary" disabled={!canContinue} onClick={handleContinue}>
        {!design ? 'Upload artwork to continue →' : totalQty < minQty ? `Add ${minQty - totalQty} more pieces →` : 'Continue to checkout →'}
      </button>
    </div>
  )
}
