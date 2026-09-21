import { useEffect, useState } from 'react'
import client from '../../api/client'
import ProductTile from '../components/ProductTile'
import StitchLoader from '../components/StitchLoader'

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'tshirt', label: 'Tees' },
  { value: 'hoodie', label: 'Hoodies' },
]

export default function MobileShop() {
  const [category, setCategory] = useState('')
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    client.get('/api/products', { params: category ? { category } : {} })
      .then((res) => setProducts(res.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [category])

  return (
    <div style={{ padding: '18px 16px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            className={`ls-chip${category === c.value ? ' active' : ''}`}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <StitchLoader label="Loading catalog" />
      ) : products.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ls-text-muted)', textAlign: 'center', padding: '40px 0' }}>
          Nothing here yet. Check back for the next drop.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 12px' }}>
          {products.map((p) => <ProductTile key={p.id} product={p} />)}
        </div>
      )}
    </div>
  )
}
