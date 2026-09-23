import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl } from '../api/client'
import { formatINR } from '../utils/format'
import { readRecent } from '../utils/recentlyViewed'

export default function RecentlyViewed({ excludeSlug }) {
  const items = useMemo(() => readRecent().filter((r) => r.slug !== excludeSlug).slice(0, 6), [excludeSlug])
  if (items.length === 0) return null

  return (
    <section className="mt-16 pt-10 border-t border-panel-2" aria-labelledby="recent-title">
      <h2 id="recent-title" className="font-display text-3xl uppercase text-paper mb-6">Recently viewed</h2>
      <div className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-5 sm:scroll-px-0 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((r) => (
          <Link key={r.slug} to={`/product/${r.slug}`} className="group w-36 sm:w-44 shrink-0 snap-start">
            <div className="aspect-[4/5] bg-panel overflow-hidden">
              {r.image && <img src={mediaUrl(r.image)} alt={r.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
            </div>
            <p className="text-sm text-paper mt-2 leading-snug">{r.name}</p>
            <p className="font-mono text-xs text-slate mt-0.5">{formatINR(r.price)}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
