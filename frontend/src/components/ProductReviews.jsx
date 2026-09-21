import { useEffect, useState } from 'react'
import client from '../api/client'
import StarRating from './StarRating'

export default function ProductReviews({ slug, onSummary }) {
  const [data, setData] = useState({ average: 0, count: 0, reviews: [] })
  const [form, setForm] = useState({ name: '', rating: 5, title: '', body: '' })
  const [status, setStatus] = useState({ state: 'idle', message: '' })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    client.get(`/api/products/${slug}/reviews`).then((res) => {
      setData(res.data)
      onSummary?.(res.data)
    }).catch(() => {})
  }, [slug, onSummary])

  const submit = async (e) => {
    e.preventDefault()
    setStatus({ state: 'loading', message: '' })
    try {
      const res = await client.post(`/api/products/${slug}/reviews`, form)
      setStatus({ state: 'done', message: res.data.detail })
    } catch {
      setStatus({ state: 'error', message: 'Could not submit your review. Please try again.' })
    }
  }

  return (
    <section className="mt-16 pt-10 border-t border-panel-2" aria-labelledby="reviews-title">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h2 id="reviews-title" className="font-display text-3xl uppercase text-paper">Reviews</h2>
          {data.count > 0 ? (
            <div className="flex items-center gap-3 mt-2">
              <StarRating value={data.average} size={18} />
              <span className="font-mono text-sm text-paper">{data.average}</span>
              <span className="font-mono text-xs text-slate">({data.count})</span>
            </div>
          ) : (
            <p className="font-mono text-xs text-slate mt-2">No reviews yet — be the first.</p>
          )}
        </div>
        {status.state !== 'done' && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="border border-panel-2 px-5 py-3 font-mono text-xs uppercase tracking-widest text-paper hover:border-acid hover:text-acid transition-colors">
            {open ? 'Cancel' : 'Write a review'}
          </button>
        )}
      </div>

      {status.state === 'done' && <p className="font-mono text-sm text-acid mb-8" role="status">✓ {status.message}</p>}

      {open && status.state !== 'done' && (
        <form onSubmit={submit} className="border border-panel-2 bg-panel p-5 mb-8 grid gap-4 max-w-xl">
          <div>
            <span className="field-label">Rating</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, rating: n }))} className="w-11 h-11 flex items-center justify-center">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill={n <= form.rating ? 'var(--color-acid)' : 'none'} stroke="var(--color-acid)" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                    <path d="m12 2.5 2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="review-name">Name</label>
            <input id="review-name" required maxLength={100} className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="field-label" htmlFor="review-title">Headline (optional)</label>
            <input id="review-title" maxLength={150} className="field-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="field-label" htmlFor="review-body">Review</label>
            <textarea id="review-body" rows={4} maxLength={2000} className="field-input" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          {status.state === 'error' && <p className="font-mono text-xs text-riot" role="alert">{status.message}</p>}
          <button type="submit" disabled={status.state === 'loading'} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors disabled:opacity-60 w-fit">
            {status.state === 'loading' ? 'Sending…' : 'Submit review'}
          </button>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {data.reviews.map((r) => (
          <article key={r.id} className="border border-panel-2 p-5">
            <StarRating value={r.rating} />
            {r.title && <h3 className="font-medium text-paper mt-3">{r.title}</h3>}
            {r.body && <p className="text-sm text-paper/70 leading-relaxed mt-1">{r.body}</p>}
            <p className="font-mono text-[11px] text-slate mt-3 uppercase tracking-wider">{r.name}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
