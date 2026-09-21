import { useNavigate } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { mediaUrl } from '../../api/client'
import { formatINR } from '../../utils/format'
import useQuote from '../../hooks/useQuote'
import { TrashIcon } from '../icons'

export default function MobileCart() {
  const navigate = useNavigate()
  const { items, updateQuantity, removeItem, subtotal } = useCart()
  const quote = useQuote(items)

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

  return (
    <div style={{ padding: '18px 16px' }}>
      {items.map((item) => (
        <div key={item.key} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--ls-divider)' }}>
          <div className="ls-swatch" style={{ width: 64, height: 76, flex: 'none' }}>
            {item.image ? (
              <img src={mediaUrl(item.image)} alt={item.name} />
            ) : (
              <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'var(--ls-text-muted)' }}>PHOTO</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700 }}>{item.name}</p>
            <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--ls-text-muted)' }}>
              {item.color ? `${item.color} / ` : ''}Size {item.size}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="ls-stepper-btn" disabled={item.quantity <= 1} onClick={() => updateQuantity(item.key, item.quantity - 1)}>−</button>
              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{item.quantity}</span>
              <button className="ls-stepper-btn" disabled={item.quantity >= item.maxStock} onClick={() => updateQuantity(item.key, item.quantity + 1)}>+</button>
              <button
                onClick={() => removeItem(item.key)}
                aria-label="Remove"
                style={{ marginLeft: 'auto', border: 0, background: 'transparent', color: 'var(--ls-text-muted)', cursor: 'pointer', padding: 4 }}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ls-accent)', whiteSpace: 'nowrap' }}>
            {formatINR(item.price * item.quantity)}
          </span>
        </div>
      ))}

      <div style={{ paddingTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ls-text-muted)' }}>Subtotal</span>
          <span style={{ fontSize: 13 }}>{formatINR(subtotal)}</span>
        </div>
        {quote && quote.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: 'var(--ls-accent)' }}>
            <span style={{ fontSize: 12 }}>Offer · {quote.offer_label}</span>
            <span style={{ fontSize: 12 }}>−{formatINR(quote.discount)}</span>
          </div>
        )}
        {quote && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--ls-text-muted)' }}>Delivery</span>
            <span style={{ fontSize: 12 }}>{quote.shipping_fee === 0 ? 'FREE' : formatINR(quote.shipping_fee)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--ls-text-muted)' }}>Total</span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{formatINR(quote?.total ?? subtotal)}</span>
        </div>
        <button className="ls-btn-primary" onClick={() => navigate('/app/checkout')}>Checkout →</button>
      </div>
    </div>
  )
}
