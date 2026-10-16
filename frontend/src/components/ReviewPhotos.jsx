import { useEffect, useState } from 'react'
import { mediaUrl } from '../api/client'

// Customer photos on a review (from the WhatsApp review form). Tap a thumbnail to see it full size.
// Inline styles so it fits both the desktop storefront and the mobile layout.
export default function ReviewPhotos({ photos, name, size = 72 }) {
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (open === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, photos])

  if (!photos?.length) return null

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {photos.map((url, i) => (
          <button key={url} type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} from ${name}`}
            style={{ width: size, height: size, padding: 0, border: 'none', background: 'rgba(127,127,127,0.15)', cursor: 'zoom-in', overflow: 'hidden' }}>
            <img src={mediaUrl(url)} alt={`Photo from ${name}`} loading="lazy" decoding="async" width={size} height={size}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ))}
      </div>

      {open !== null && (
        <div role="dialog" aria-modal="true" aria-label={`Photo from ${name}`} onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <img src={mediaUrl(photos[open])} alt={`Photo ${open + 1} from ${name}`} onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain' }} />
          <button type="button" onClick={() => setOpen(null)} aria-label="Close photo" autoFocus
            style={{ position: 'absolute', top: 12, right: 12, width: 44, height: 44, border: 'none', background: 'transparent', color: '#fff', fontSize: 28, cursor: 'pointer' }}>
            ×
          </button>
          {photos.length > 1 && (
            <p style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#fff', fontFamily: 'monospace', fontSize: 12 }}>
              {open + 1} / {photos.length}
            </p>
          )}
        </div>
      )}
    </>
  )
}
