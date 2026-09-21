import { useNavigate } from 'react-router-dom'
import { mediaUrl } from '../../api/client'
import { formatINR } from '../../utils/format'

export default function ProductTile({ product }) {
  const navigate = useNavigate()
  const image = product.colors?.[0]?.images?.[0]?.url || product.images?.[0]?.url
  const soldOut = (product.total_stock ?? 0) === 0

  return (
    <div onClick={() => navigate(`/app/product/${product.slug}`)} style={{ cursor: 'pointer' }}>
      <div className="ls-swatch" style={{ aspectRatio: '4 / 5' }}>
        {image ? (
          <img src={mediaUrl(image)} alt={product.name} loading="lazy" />
        ) : (
          <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.05em', color: 'var(--ls-text-muted)' }}>
            PRODUCT PHOTO
          </span>
        )}
        {product.is_featured && !soldOut && <span className="ls-badge ls-badge-limited">LIMITED</span>}
        {soldOut && <span className="ls-badge ls-badge-soldout">SOLD OUT</span>}
      </div>
      <p style={{ margin: '8px 0 2px', fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>{product.name}</p>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: 'var(--ls-accent)' }}>{formatINR(product.price)}</p>
    </div>
  )
}
