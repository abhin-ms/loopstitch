import { useEffect, useState } from 'react'
import client from '../../api/client'
import StarRating from '../../components/StarRating'
import ReviewPhotos from '../../components/ReviewPhotos'

// Approved reviews on the mobile product page: stars, name, feedback and customer photos.
export default function MobileReviews({ slug }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    client.get(`/api/products/${slug}/reviews`).then((res) => setData(res.data)).catch(() => {})
  }, [slug])

  if (!data?.count) return null

  const label = { margin: '0 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }
  return (
    <section aria-labelledby="m-reviews" style={{ padding: '0 16px 24px' }}>
      <h2 id="m-reviews" style={label}>Reviews</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <StarRating value={data.average} size={16} />
        <span style={{ fontSize: 13, fontWeight: 800 }}>{data.average}</span>
        <span style={{ fontSize: 12, color: 'var(--ls-text-muted)' }}>({data.count})</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {data.reviews.map((r) => (
          <article key={r.id} style={{ background: 'var(--ls-surface)', padding: 14 }}>
            <StarRating value={r.rating} />
            {r.title && <h3 style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 800 }}>{r.title}</h3>}
            {r.body && <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55 }}>{r.body}</p>}
            <ReviewPhotos photos={r.photos} name={r.name} size={64} />
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
              {r.name}{r.source === 'whatsapp' && <span style={{ color: 'var(--ls-accent)' }}> · Verified buyer</span>}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
