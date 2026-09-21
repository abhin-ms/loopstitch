import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useAnnouncements from '../hooks/useAnnouncements'
import CouponChip from './CouponChip'

export const STYLES = {
  acid: 'bg-acid text-ink',
  riot: 'bg-riot text-ink',
  ink: 'bg-paper text-ink',
}

const DISMISS_KEY = 'loopstitch_bar_dismissed'

function readDismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) || '' } catch { return '' }
}

export default function AnnouncementBar() {
  const all = useAnnouncements()
  const items = all.filter((a) => a.placement === 'bar' || a.placement === 'both')
  const signature = items.map((a) => a.id).join(',')
  const [dismissedSig, setDismissedSig] = useState(readDismissed)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (items.length < 2 || paused) return undefined
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 5000)
    return () => clearInterval(timer)
  }, [items.length, paused])

  if (items.length === 0 || dismissedSig === signature) return null
  const item = items[index % items.length]

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, signature) } catch { /* storage unavailable */ }
    setDismissedSig(signature)
  }

  const text = (
    <span className="font-mono text-[11px] sm:text-xs uppercase tracking-widest font-bold">
      {item.message}
      {item.link_url && <span className="underline underline-offset-4 ml-2">{item.link_label || 'Shop now'} →</span>}
    </span>
  )

  return (
    <div
      className={`relative ${STYLES[item.style] || STYLES.acid}`}
      role="region"
      aria-label="Announcement"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-12 py-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center" aria-live="polite">
        {item.link_url?.startsWith('/') ? (
          <Link to={item.link_url}>{text}</Link>
        ) : item.link_url ? (
          <a href={item.link_url} target="_blank" rel="noopener noreferrer">{text}</a>
        ) : text}
        {item.coupon_code && <CouponChip code={item.coupon_code} />}
      </div>
      <button onClick={dismiss} aria-label="Dismiss announcement" className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-lg leading-none hover:opacity-70">
        ×
      </button>
    </div>
  )
}
