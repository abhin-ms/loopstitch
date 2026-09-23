import { useEffect, useMemo, useState } from 'react'
import client from '../api/client'
import ProductCard from '../components/ProductCard'
import ProductSkeleton from '../components/ProductSkeleton'
import { useWishlist } from '../context/WishlistContext'

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
]

const chip = (active) => `font-mono text-xs uppercase tracking-widest px-4 py-2.5 border transition-colors ${active ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper'}`

export default function Shop() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const wishlist = useWishlist()

  useEffect(() => {
    document.title = 'Shop unisex oversized tees | Loopstitch Co.'
    return () => { document.title = 'Loopstitch Co.' }
  }, [])

  useEffect(() => {
    setLoading(true)
    client
      .get('/api/products')
      .then((res) => setProducts(res.data))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = products.filter((p) => {
      if (q && !`${p.name} ${p.colorway || ''}`.toLowerCase().includes(q)) return false
      if (inStockOnly && (p.total_stock ?? 0) === 0) return false
      if (savedOnly && !wishlist.has(p.id)) return false
      return true
    })
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
    return list
  }, [products, query, sort, inStockOnly, savedOnly, wishlist])

  const filtersActive = query || inStockOnly || savedOnly

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
      <div className="mb-10">
        <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">Unisex · Oversized fit</p>
        <h1 className="font-display text-4xl sm:text-5xl uppercase text-paper">Shop the drop</h1>
        <p className="text-sm text-slate mt-3 max-w-xl">Every tee is cut unisex with a relaxed, dropped-shoulder fit. Not sure of your size? <a href="/faq#sizing" className="underline underline-offset-4 hover:text-acid">See the size help</a>.</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
        <div className="flex gap-2 flex-1 lg:justify-end flex-wrap">
          <label className="sr-only" htmlFor="shop-search">Search products</label>
          <input id="shop-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="field-input sm:max-w-56" />
          <label className="sr-only" htmlFor="shop-sort">Sort products</label>
          <select id="shop-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="field-input sm:w-auto">
            {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-8">
        <button onClick={() => setInStockOnly((v) => !v)} aria-pressed={inStockOnly} className={chip(inStockOnly)}>In stock</button>
        <button onClick={() => setSavedOnly((v) => !v)} aria-pressed={savedOnly} className={chip(savedOnly)}>♥ Saved ({wishlist.ids.length})</button>
        {filtersActive && (
          <button onClick={() => { setQuery(''); setInStockOnly(false); setSavedOnly(false) }} className="font-mono text-xs uppercase tracking-widest text-slate hover:text-riot px-2">Clear</button>
        )}
      </div>

      <p className="font-mono text-[11px] text-slate mb-6" role="status" aria-live="polite">
        {loading ? '' : `${visible.length} ${visible.length === 1 ? 'piece' : 'pieces'}`}
      </p>

      {loading ? (
        <ProductSkeleton />
      ) : visible.length === 0 ? (
        <div className="text-center py-24 text-slate font-mono text-sm">
          {filtersActive ? 'Nothing matches those filters.' : 'Nothing here yet. Check back for the next drop.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10 sm:gap-y-12">
          {visible.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      )}
    </div>
  )
}
