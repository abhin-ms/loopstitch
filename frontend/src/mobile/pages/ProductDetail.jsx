import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client, { mediaUrl } from '../../api/client'
import { useCart } from '../../context/CartContext'
import { formatINR } from '../../utils/format'
import { useToast } from '../context/ToastContext'
import StitchLoader from '../components/StitchLoader'

export default function MobileProductDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const { showToast } = useToast()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedColorId, setSelectedColorId] = useState(null)
  const [selectedSize, setSelectedSize] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    client.get(`/api/products/${slug}`)
      .then((res) => {
        setProduct(res.data)
        setSelectedColorId(res.data.colors?.[0]?.id || null)
        setSelectedSize(null)
      })
      .catch(() => setError('This product doesn\'t exist or was removed.'))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <StitchLoader label="Loading product" />
  if (error || !product) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--ls-text-muted)', marginBottom: 14 }}>{error}</p>
        <button className="ls-btn-outline" style={{ width: 'auto' }} onClick={() => navigate('/app/shop')}>← Back to shop</button>
      </div>
    )
  }

  const colors = product.colors?.length
    ? product.colors
    : [{ id: null, name: product.colorway || 'Default', hex_code: '#000000', images: product.images || [], sizes: product.sizes || [] }]
  const selectedColor = colors.find((c) => c.id === selectedColorId) || colors[0]
  const image = selectedColor.images?.[0]?.url
  const sizes = selectedColor.sizes || []
  const sizeRow = sizes.find((s) => s.size === selectedSize)
  const maxForSize = sizeRow?.stock ?? 0
  const addDisabled = !selectedSize || maxForSize < 1

  const handleAdd = () => {
    if (addDisabled) return
    addItem(product, selectedColor, selectedSize, 1, maxForSize)
    showToast('Added to cart')
    navigate(-1)
  }

  return (
    <div>
      <div className="ls-swatch" style={{ aspectRatio: '1 / 1' }}>
        {image ? (
          <img src={mediaUrl(image)} alt={product.name} />
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.05em', color: 'var(--ls-text-muted)' }}>
            PRODUCT PHOTO
          </span>
        )}
      </div>

      <div style={{ padding: '18px 16px' }}>
        {colors.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {colors.map((c) => (
              <button
                key={c.id}
                className={`ls-chip${selectedColor.id === c.id ? ' active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setSelectedColorId(c.id); setSelectedSize(null) }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '1px solid var(--ls-divider)', background: c.hex_code || '#000' }} />
                {c.name}
              </button>
            ))}
          </div>
        )}

        <h1 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, lineHeight: 1.2 }}>{product.name}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--ls-accent)' }}>{formatINR(product.price)}</p>

        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
          Size
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {sizes.map((s) => {
            const disabled = s.stock === 0
            const selected = selectedSize === s.size
            return (
              <button
                key={s.id}
                disabled={disabled}
                className={`ls-size-btn${disabled ? ' disabled' : selected ? ' selected' : ''}`}
                onClick={() => setSelectedSize(s.size)}
              >
                {s.size}
              </button>
            )
          })}
        </div>

        <button className="ls-btn-primary" disabled={addDisabled} onClick={handleAdd}>
          {!selectedSize ? 'Select a size' : maxForSize < 1 ? 'Locked — sold out' : `Add ${product.name} · ${selectedSize} →`}
        </button>

        {product.description && (
          <p style={{ margin: '20px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ls-text-muted)' }}>{product.description}</p>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--ls-text-muted)' }}>
          DTF printed on 240 GSM heavyweight cotton. Part of a limited run — once a size sells out it is retired, not restocked.
        </p>
      </div>
    </div>
  )
}
