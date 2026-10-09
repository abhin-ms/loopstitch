import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { mediaUrl } from '../api/client'

const AUTO_HIDE_MS = 5000

// Clear "it's in your cart" confirmation after Add to cart: desktop top-right,
// phones just above the sticky add-to-cart bar. Auto-hides; View cart goes straight there.
export default function AddedToCart({ item, onClose }) {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!item) return undefined
    const timer = setTimeout(onClose, AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [item, onClose])

  return (
    <div className="fixed z-50 inset-x-4 bottom-24 md:inset-x-auto md:bottom-auto md:top-24 md:right-6 md:w-96 pointer-events-none" role="status" aria-live="polite">
      <AnimatePresence>
        {item && (
          <motion.div
            key={item.key}
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-auto bg-panel border border-acid shadow-2xl shadow-black/50 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-xs uppercase tracking-widest text-acid">✓ Added to your cart</p>
              <button type="button" onClick={onClose} aria-label="Close" className="text-slate hover:text-paper text-lg leading-none w-8 h-8 -mr-2 flex items-center justify-center">×</button>
            </div>
            <div className="flex gap-3 items-center">
              {item.image ? (
                <img src={mediaUrl(item.image)} alt="" className="w-14 h-16 object-cover bg-panel-2 shrink-0" />
              ) : (
                <div className="w-14 h-16 bg-panel-2 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-paper truncate">{item.name}</p>
                <p className="font-mono text-[11px] text-slate mt-0.5">
                  {[item.color, `Size ${item.size}`, `Qty ${item.quantity}`].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button type="button" onClick={onClose} className="border border-panel-2 text-paper font-mono text-[11px] uppercase tracking-widest py-3 hover:border-paper transition-colors">
                Keep shopping
              </button>
              <Link to="/cart" onClick={onClose} className="bg-riot text-ink text-center font-mono text-[11px] uppercase tracking-widest py-3 hover:bg-acid transition-colors">
                View cart →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
