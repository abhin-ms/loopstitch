import { useEffect, useState } from 'react'
import client from '../../api/client'
import ProductTile from '../components/ProductTile'
import StitchLoader from '../components/StitchLoader'

export default function MobileShop() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    client.get('/api/products')
      .then((res) => setProducts(res.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '18px 16px' }}>
      <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ls-accent)' }}>
        Unisex · Oversized fit
      </p>

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
