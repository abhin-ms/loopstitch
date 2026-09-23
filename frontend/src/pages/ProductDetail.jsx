import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import client, { mediaUrl } from '../api/client'
import { useCart } from '../context/CartContext'
import { formatINR } from '../utils/format'
import SizePicker from '../components/SizePicker'
import Loader from '../components/Loader'
import SizeGuide from '../components/SizeGuide'
import ProductReviews from '../components/ProductReviews'
import StarRating from '../components/StarRating'
import ProductDetails from '../components/ProductDetails'
import RecentlyViewed from '../components/RecentlyViewed'
import { pushRecent } from '../utils/recentlyViewed'
import { useWishlist } from '../context/WishlistContext'
import { haptic } from '../utils/haptics'

export default function ProductDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()

  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeImage, setActiveImage] = useState(0)
  const [selectedColorId, setSelectedColorId] = useState(null)
  const [selectedSize, setSelectedSize] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [rating, setRating] = useState({ average: 0, count: 0 })
  const [zoom, setZoom] = useState(null)
  const [copied, setCopied] = useState(false)
  const wishlist = useWishlist()
  const timeoutRef = useRef(null)
  const handleSummary = useCallback((summary) => setRating({ average: summary.average, count: summary.count }), [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    client
      .get(`/api/products/${slug}`)
      .then((res) => {
        setProduct(res.data)
        pushRecent({ slug: res.data.slug, name: res.data.name, price: res.data.price, image: (res.data.colors?.[0]?.images || res.data.images || [])[0]?.url || '' })
        setActiveImage(0)
        setSelectedColorId(res.data.colors?.[0]?.id || null)
        setSelectedSize(null)
        setQuantity(1)
      })
      .catch(() => setError('Product not found'))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!product) return undefined
    const title = product.meta_title || `${product.name} | Loopstitch Co.`
    const description = product.meta_description || product.description || `Shop ${product.name} from Loopstitch Co.`
    const seoImage = (product.colors?.[0]?.images || product.images || [])[0]?.url
    document.title = title
    const tags = [
      ['name', 'description', description],
      ['property', 'og:title', title],
      ['property', 'og:description', description],
      ['property', 'og:type', 'product'],
      ...(seoImage ? [['property', 'og:image', mediaUrl(seoImage)]] : []),
    ]
    const elements = tags.map(([attribute, key, content]) => {
      let el = document.head.querySelector(`meta[${attribute}="${key}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute(attribute, key); document.head.appendChild(el) }
      el.setAttribute('content', content)
      return el
    })
    const schema = document.createElement('script')
    schema.type = 'application/ld+json'
    schema.dataset.loopstitchProduct = 'true'
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Product', name: product.name,
      description, image: (product.colors?.[0]?.images || product.images || []).map((image) => mediaUrl(image.url)),
      sku: product.slug,
      audience: { '@type': 'PeopleAudience', suggestedGender: 'unisex' },
      ...(rating.count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.average, reviewCount: rating.count } } : {}),
      offers: { '@type': 'Offer', priceCurrency: 'INR', price: product.price, availability: product.total_stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: window.location.href },
    })
    document.head.appendChild(schema)
    return () => { elements.forEach((el) => el.remove()); schema.remove() }
  }, [product, rating])

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  if (loading) return <Loader label="Loading product" />
  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <p className="font-mono text-slate mb-4">This product doesn't exist or was removed.</p>
        <Link to="/shop" className="text-acid font-mono text-xs uppercase tracking-widest">← Back to shop</Link>
      </div>
    )
  }

  const colors = product.colors?.length ? product.colors : [{ id: null, name: product.colorway || 'Default', hex_code: '#000000', images: product.images || [], sizes: product.sizes || [] }]
  const selectedColor = colors.find((color) => color.id === selectedColorId) || colors[0]
  const images = selectedColor.images || []
  const sizes = selectedColor.sizes || []
  const sizeRow = sizes.find((s) => s.size === selectedSize)
  const maxForSize = sizeRow?.stock ?? 0
  const totalStock = product.total_stock

  const handleAdd = () => {
    if (!selectedSize || maxForSize < 1) return
    addItem(product, selectedColor, selectedSize, quantity, maxForSize)
    haptic(20)
    setJustAdded(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setJustAdded(false), 1800)
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-16">
      <button onClick={() => navigate(-1)} className="font-mono text-xs text-slate hover:text-paper mb-6 sm:mb-8 uppercase tracking-widest py-2">
        ← Back
      </button>

      <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
        {/* Gallery */}
        <div>
          <div
            className="relative aspect-[4/5] bg-panel overflow-hidden mb-3 cursor-zoom-in"
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
            onMouseLeave={() => setZoom(null)}
          >
            <AnimatePresence mode="wait">
              {images.length > 0 ? (
                <motion.img
                  key={activeImage}
                  src={mediaUrl(images[activeImage]?.url)}
                  alt={product.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 w-full h-full object-cover "
                  style={{ scale: zoom ? 1.8 : 1, originX: zoom ? zoom.x / 100 : 0.5, originY: zoom ? zoom.y / 100 : 0.5 }}
                  drag={images.length > 1 ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.25}
                  dragSnapToOrigin
                  onDragEnd={(_, info) => {
                    if (Math.abs(info.offset.x) < 60 && Math.abs(info.velocity.x) < 400) return
                    haptic(8)
                    setActiveImage((i) => (info.offset.x < 0 ? Math.min(images.length - 1, i + 1) : Math.max(0, i - 1)))
                  }}
                  fetchPriority="high"
                  width="800"
                  height="1000"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-dim font-mono text-xs">NO IMAGE</div>
              )}
            </AnimatePresence>
            {totalStock === 0 && (
              <span className="sticker absolute top-4 left-4 bg-ink border border-riot text-riot text-xs font-mono font-bold px-3 py-1.5 uppercase tracking-wider">
                Sold Out
              </span>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImage(i)}
                  className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden border ${i === activeImage ? 'border-acid' : 'border-panel-2'}`}
                >
                  <img src={mediaUrl(img.url)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          {colors.length > 1 && (
            <div className="mb-6"><div className="flex items-center justify-between mb-3"><span className="font-mono text-xs uppercase tracking-widest text-slate">Color</span><span className="font-mono text-xs text-paper">{selectedColor.name}</span></div><div className="flex flex-wrap gap-3">{colors.map((color) => <button key={color.id || color.name} type="button" onClick={() => { setSelectedColorId(color.id); setActiveImage(0); setSelectedSize(null); setQuantity(1) }} className={`flex items-center gap-2 border px-3 py-2 font-mono text-xs ${selectedColor.id === color.id ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper'}`}><span className="w-4 h-4 rounded-full border border-paper/30" style={{ backgroundColor: color.hex_code || '#000000' }} />{color.name}</button>)}</div></div>
          )}
          {colors.length === 1 && product.colorway && <p className="font-mono text-xs text-slate uppercase tracking-widest mb-2">{product.colorway}</p>}
          <p className="font-mono text-[11px] uppercase tracking-widest text-acid mb-1">Unisex · Oversized fit</p>
          <h1 className="font-display text-3xl sm:text-4xl uppercase text-paper leading-tight mb-3">{product.name}</h1>
          {rating.count > 0 && (
            <a href="#reviews-title" className="flex items-center gap-2 mb-3 w-fit">
              <StarRating value={rating.average} />
              <span className="font-mono text-xs text-slate">{rating.average} · {rating.count} review{rating.count > 1 ? 's' : ''}</span>
            </a>
          )}
          <div className="flex items-center gap-3 mb-6">
            <span className="font-mono text-xl text-paper">{formatINR(product.price)}</span>
            {product.compare_at_price > 0 && (
              <span className="font-mono text-sm text-slate-dim line-through">{formatINR(product.compare_at_price)}</span>
            )}
          </div>

          {product.description && (
            <p className="text-paper/70 text-sm leading-relaxed mb-8 max-w-md">{product.description}</p>
          )}

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-xs uppercase tracking-widest text-slate">Size · <button type="button" onClick={() => setGuideOpen(true)} className="underline underline-offset-4 hover:text-acid py-2">Size guide</button></span>
              {selectedSize && (
                <span className="font-mono text-xs text-slate">
                  {maxForSize > 0 ? `${maxForSize} in stock` : 'Locked — sold out'}
                </span>
              )}
            </div>
            <SizePicker sizes={sizes} selected={selectedSize} onSelect={setSelectedSize} />
          </div>

          {selectedSize && maxForSize > 0 && (
            <div className="mb-8">
              <span className="font-mono text-xs uppercase tracking-widest text-slate block mb-3">Quantity</span>
              <div className="flex items-center border border-panel-2 w-fit">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-11 h-11 font-mono text-paper hover:text-acid"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-11 text-center font-mono text-paper">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(maxForSize, q + 1))}
                  className="w-11 h-11 font-mono text-paper hover:text-acid"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={!selectedSize || maxForSize < 1}
            className={`w-full sm:w-auto px-10 py-4 font-mono text-sm uppercase tracking-widest transition-colors ${
              !selectedSize || maxForSize < 1
                ? 'bg-panel-2 text-slate-dim cursor-not-allowed'
                : justAdded
                  ? 'bg-acid text-ink'
                  : 'bg-riot text-ink hover:bg-acid'
            }`}
          >
            {!selectedSize ? 'Select a size' : maxForSize < 1 ? 'Locked — sold out' : justAdded ? 'Added ✓' : 'Add to cart'}
          </button>

          <div className="flex gap-3 mt-4">
            <button type="button" onClick={() => wishlist.toggle(product.id)} aria-pressed={wishlist.has(product.id)} className="border border-panel-2 px-4 py-3 font-mono text-xs uppercase tracking-widest text-slate hover:text-riot hover:border-riot transition-colors">
              {wishlist.has(product.id) ? '♥ Saved' : '♡ Save'}
            </button>
            <button
              type="button"
              onClick={async () => {
                const data = { title: product.name, url: window.location.href }
                if (navigator.share) { try { await navigator.share(data) } catch { /* dismissed */ } return }
                try { await navigator.clipboard.writeText(data.url); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard blocked */ }
              }}
              className="border border-panel-2 px-4 py-3 font-mono text-xs uppercase tracking-widest text-slate hover:text-acid hover:border-acid transition-colors"
            >
              {copied ? 'Link copied' : 'Share'}
            </button>
          </div>

          <ProductDetails onOpenSizeGuide={() => setGuideOpen(true)} />
        </div>
      </div>

      <ProductReviews slug={product.slug} onSummary={handleSummary} />
      <SizeGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        onPick={(size) => { setSelectedSize(size); setQuantity(1) }}
        available={sizes.filter((x) => x.stock > 0).map((x) => x.size)}
      />
      <RecentlyViewed excludeSlug={product.slug} />

      {/* Sticky mobile add-to-cart */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-ink/95 backdrop-blur border-t border-panel-2 px-5 py-3 flex items-center gap-4">
        <span className="font-mono text-paper">{formatINR(product.price)}</span>
        <button
          onClick={handleAdd}
          disabled={!selectedSize || maxForSize < 1}
          className={`flex-1 py-3.5 font-mono text-xs uppercase tracking-widest ${!selectedSize || maxForSize < 1 ? 'bg-panel-2 text-slate-dim' : justAdded ? 'bg-acid text-ink' : 'bg-riot text-ink'}`}
        >
          {!selectedSize ? 'Select a size' : maxForSize < 1 ? 'Sold out' : justAdded ? 'Added ✓' : 'Add to cart'}
        </button>
      </div>
      <div className="md:hidden h-16" aria-hidden="true" />
    </div>
  )
}
