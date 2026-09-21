import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'
import ProductTile from '../components/ProductTile'
import StitchLoader from '../components/StitchLoader'

export default function MobileHome() {
  const navigate = useNavigate()
  const [featured, setFeatured] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/api/products', { params: { featured: true } })
      .then((res) => setFeatured(res.data))
      .catch(() => setFeatured([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div style={{ padding: '20px 16px 8px' }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ls-accent)' }}>
          DTF printing · Calicut, Kerala
        </p>
        <h1 style={{ margin: '0 0 10px', fontSize: 30, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.01em' }}>
          Wear a drop.<br />Or wear your own.
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--ls-text-muted)' }}>
          Limited anime-inspired tees, printed in small batches and never restocked — or send your own design.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <button className="ls-btn-primary" onClick={() => navigate('/app/shop')}>Shop the drops →</button>
          <button className="ls-btn-outline" onClick={() => navigate('/app/customize')}>Start a custom print →</button>
        </div>
      </div>

      <div style={{ height: 2, background: 'var(--ls-divider)' }} />

      <div style={{ padding: '20px 16px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ls-accent)' }}>
          Featured
        </p>
        <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800 }}>While it lasts</h2>
        {loading ? (
          <StitchLoader label="Loading drops" />
        ) : featured.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--ls-text-muted)' }}>No featured drops right now — check the full shop.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {featured.map((p) => <ProductTile key={p.id} product={p} />)}
          </div>
        )}
      </div>

      <div style={{ height: 2, background: 'var(--ls-divider)' }} />

      <div style={{ padding: '20px 16px 32px' }}>
        <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ls-accent)' }}>
          The custom studio
        </p>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>
          Or print exactly what you want.
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--ls-text-muted)' }}>
          Upload artwork, a logo, or a photo — DTF printed on 240 GSM cotton, shipped from Calicut.
        </p>
        <button className="ls-btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/app/customize')}>
          Start your custom order →
        </button>
      </div>
    </div>
  )
}
