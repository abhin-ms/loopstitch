import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { mediaUrl } from '../api/client'
import { formatINR } from '../utils/format'
import { useWishlist } from '../context/WishlistContext'
import { haptic } from '../utils/haptics'

export default function ProductCard({ product, index = 0 }) {
  const wishlist = useWishlist()
  const wished = wishlist.has(product.id)
  const primaryImage = product.images?.[0]?.url
  const secondaryImage = product.images?.[1]?.url
  const totalStock = product.total_stock ?? 0
  const isSoldOut = totalStock === 0
  const isLowStock = totalStock > 0 && totalStock <= 6

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: (index % 6) * 0.06 }}
    >
      <Link to={`/product/${product.slug}`} className="group block">
        <div className="relative aspect-[4/5] overflow-hidden bg-panel">
          {primaryImage ? (
            <img
              src={mediaUrl(primaryImage)}
              alt={product.name}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 group-hover:opacity-0"
              loading="lazy"
              decoding="async"
              width="800"
              height="1000"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-dim font-mono text-xs">NO IMAGE</div>
          )}
          {secondaryImage && (
            <img
              src={mediaUrl(secondaryImage)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              loading="lazy"
            />
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); wishlist.toggle(product.id); haptic(10) }}
            aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
            aria-pressed={wished}
            className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center z-10"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill={wished ? 'var(--color-riot)' : 'rgba(0,0,0,0.25)'} stroke={wished ? 'var(--color-riot)' : '#fff'} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-9.5-9.2C1 8.4 3 5 6.4 5c2 0 3.6 1.1 4.6 2.7h2C14 6.1 15.600 5 17.600 5 21 5 23 8.400 21.500 11.800 19.500 16.400 12 21 12 21z" />
            </svg>
          </button>
          <div className="absolute inset-0 screentone-red screentone opacity-0 group-hover:opacity-[0.08] transition-opacity duration-500" />

          {product.is_featured && !isSoldOut && (
            <span className="sticker absolute top-3 left-3 bg-acid text-ink text-[10px] font-mono font-bold px-2 py-1 uppercase tracking-wider">
              Limited
            </span>
          )}
          {isSoldOut && (
            <span className="sticker absolute top-3 left-3 bg-ink border border-riot text-riot text-[10px] font-mono font-bold px-2 py-1 uppercase tracking-wider">
              Sold Out
            </span>
          )}
          {isLowStock && !isSoldOut && (
            <span className="absolute bottom-3 left-3 bg-ink/80 backdrop-blur text-acid text-[10px] font-mono px-2 py-1 uppercase tracking-wider">
              Only {totalStock} left
            </span>
          )}
        </div>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-body font-medium text-paper text-sm sm:text-base leading-snug">{product.name}</h3>
            {product.colors?.length > 1 ? (
              <div className="flex items-center gap-1.5 mt-1" aria-label={`${product.colors.length} colors available`}>
                {product.colors.slice(0, 5).map((color) => <span key={color.id} className="w-3 h-3 rounded-full border border-paper/30" style={{ backgroundColor: color.hex_code || '#000000' }} title={color.name} />)}
                <span className="font-mono text-[10px] text-slate ml-1">{product.colors.length} colors</span>
              </div>
            ) : product.colorway && <p className="font-mono text-[11px] text-slate mt-0.5 uppercase">{product.colorway}</p>}
          </div>
          <div className="text-right shrink-0 font-mono">
            <span className="text-paper text-sm">{formatINR(product.price)}</span>
            {product.compare_at_price && (
              <span className="block text-slate-dim text-[11px] line-through">{formatINR(product.compare_at_price)}</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
