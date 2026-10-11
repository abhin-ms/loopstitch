import { useState } from 'react'
import client from '../api/client'
import { haptic } from '../utils/haptics'

const KEY = 'loopstitch_liked'

function readLiked() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function saveLiked(ids) {
  try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* storage blocked */ }
}

export function HeartIcon({ filled = false, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.4 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.4 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2Z" />
    </svg>
  )
}

// ❤ like for visitors, no login. This browser remembers what it liked (tap again to undo);
// the count is shared with everyone and the server caps likes per IP.
export default function LikeButton({ product, className = '', compact = false }) {
  const [liked, setLiked] = useState(() => readLiked().includes(product.id))
  const [count, setCount] = useState(product.likes || 0)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (busy) return
    const next = !liked
    setBusy(true)
    setLiked(next)
    setCount((c) => Math.max(0, c + (next ? 1 : -1)))  // show it straight away
    if (next) haptic(15)
    try {
      const res = await client.post(`/api/products/${product.slug}/like`, { liked: next })
      setCount(res.data.likes)
      const ids = readLiked().filter((id) => id !== product.id)
      saveLiked(next ? [...ids, product.id] : ids)
    } catch {
      setLiked(!next)  // too many likes from this network, or offline: undo
      setCount((c) => Math.max(0, c + (next ? -1 : 1)))
    } finally {
      setBusy(false)
    }
  }

  const label = `${count.toLocaleString('en-IN')} ${count === 1 ? 'like' : 'likes'}`
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? `Liked — ${label}. Tap to undo.` : `Like this product — ${label}`}
      className={className || `inline-flex items-center gap-2 border px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${
        liked ? 'border-riot text-riot bg-riot/10' : 'border-panel-2 text-slate hover:text-riot hover:border-riot'
      }`}
    >
      <HeartIcon filled={liked} />
      {compact ? count.toLocaleString('en-IN') : <span>{liked ? 'Liked' : 'Like'} · {count.toLocaleString('en-IN')}</span>}
    </button>
  )
}
