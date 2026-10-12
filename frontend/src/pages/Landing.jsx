import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import pages from '../content/pages.json'
import usePageSeo from '../hooks/usePageSeo'
import ProductCard from '../components/ProductCard'
import ProductSkeleton from '../components/ProductSkeleton'

// Keyword landing / collection page. All copy comes from src/content/pages.json — the same
// text the server puts in the raw HTML for search engines (backend/app/seo.py).
export default function Landing({ pageKey }) {
  const page = pages[pageKey]
  const [products, setProducts] = useState(null)
  const wantsProducts = page.match?.length > 0
  usePageSeo(pageKey)

  useEffect(() => {
    if (!wantsProducts) return
    client.get('/api/products').then((res) => setProducts(res.data)).catch(() => setProducts([]))
  }, [wantsProducts])

  // names containing one of the page's keywords; if none match yet, show the whole range
  const words = (page.match || []).map((w) => w.toLowerCase())
  const hits = (products || []).filter((p) => words.some((w) => p.name.toLowerCase().includes(w)))
  const shown = hits.length ? hits : products || []

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-16">
      <nav aria-label="Breadcrumb" className="font-mono text-[11px] uppercase tracking-widest text-slate mb-8">
        <Link to="/" className="hover:text-acid">Home</Link> <span aria-hidden="true">›</span> <span className="text-paper/80">{page.breadcrumb}</span>
      </nav>

      <header className="max-w-3xl mb-10 sm:mb-14">
        <p className="font-mono text-xs text-riot tracking-widest uppercase mb-3">{page.eyebrow}</p>
        <h1 className="font-display text-4xl sm:text-6xl uppercase text-paper leading-none">{page.h1}</h1>
        {page.intro.map((text) => (
          <p key={text} className="text-paper/80 text-sm sm:text-base leading-relaxed mt-5">{text}</p>
        ))}
        <Link to={page.cta.to} className="inline-block mt-7 bg-riot text-ink font-mono text-xs uppercase tracking-widest px-7 py-3.5 hover:bg-acid transition-colors">
          {page.cta.label} →
        </Link>
      </header>

      {wantsProducts && (
        <section aria-label="Products" className="mb-14">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10">
            {products === null
              ? Array.from({ length: 4 }, (_, i) => <ProductSkeleton key={i} />)
              : shown.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-x-12 gap-y-10 max-w-5xl">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-4">{section.heading}</h2>
            {section.body.map((text) => (
              <p key={text} className="text-paper/75 text-sm sm:text-base leading-relaxed mb-4">{text}</p>
            ))}
          </section>
        ))}
      </div>

      <nav aria-label="More from Loopstitch" className="mt-14 pt-8 border-t border-panel-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-4">More from Loopstitch</p>
        <ul className="flex flex-wrap gap-3">
          {page.links.filter((key) => pages[key]).map((key) => (
            <li key={key}>
              <Link to={pages[key].path} className="inline-block border border-panel-2 text-paper font-mono text-xs uppercase tracking-widest px-4 py-3 hover:border-acid hover:text-acid transition-colors">
                {pages[key].breadcrumb}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
