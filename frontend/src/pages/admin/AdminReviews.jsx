import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'
import StarRating from '../../components/StarRating'

export default function AdminReviews() {
  const [reviews, setReviews] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    client.get('/api/admin/reviews').then((res) => setReviews(res.data)).catch(() => setError('Failed to load reviews'))
  }, [])

  const handleToggle = async (review) => {
    try {
      await client.patch(`/api/admin/reviews/${review.id}/toggle`)
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, is_approved: !r.is_approved } : r)))
    } catch {
      alert('Failed to update review.')
    }
  }

  const handleDelete = async (review) => {
    if (!confirm('Delete this review? This can\'t be undone.')) return
    try {
      await client.delete(`/api/admin/reviews/${review.id}`)
      setReviews((prev) => prev.filter((r) => r.id !== review.id))
    } catch {
      alert('Failed to delete review.')
    }
  }

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!reviews) return <Loader label="Loading reviews" />

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-2">Reviews</h1>
      <p className="font-mono text-[11px] text-slate mb-8">New reviews stay hidden until you approve them. Only approved reviews show on the storefront.</p>

      {reviews.length === 0 ? (
        <p className="font-mono text-sm text-slate">No reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="border border-panel-2 bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StarRating value={r.rating} />
                  <span className="font-mono text-xs text-paper">{r.name}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-wider ${r.is_approved ? 'text-acid' : 'text-riot'}`}>
                    {r.is_approved ? 'Approved' : 'Pending'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleToggle(r)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-paper hover:border-acid hover:text-acid">
                    {r.is_approved ? 'Hide' : 'Approve'}
                  </button>
                  <button onClick={() => handleDelete(r)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate hover:border-riot hover:text-riot">
                    Delete
                  </button>
                </div>
              </div>
              {r.title && <p className="font-medium text-paper text-sm mt-3">{r.title}</p>}
              {r.body && <p className="text-paper/70 text-sm mt-1 leading-relaxed">{r.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
