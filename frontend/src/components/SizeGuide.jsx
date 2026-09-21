import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Chest / length in inches for the oversized, dropped-shoulder fit.
const ROWS = [
  ['S', '40', '27'],
  ['M', '42', '28'],
  ['L', '44', '29'],
  ['XL', '46', '30'],
  ['XXL', '48', '31'],
]

export default function SizeGuide({ open, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={onClose}
        >
          <div
            role="dialog" aria-modal="true" aria-labelledby="size-guide-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-panel border border-panel-2 p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <h2 id="size-guide-title" className="font-display text-2xl uppercase text-paper">Size guide</h2>
              <button ref={closeRef} onClick={onClose} aria-label="Close size guide" className="text-slate hover:text-paper w-11 h-11 -mt-2 -mr-2 flex items-center justify-center">✕</button>
            </div>
            <table className="w-full font-mono text-sm">
              <thead>
                <tr className="text-left text-slate text-[11px] uppercase tracking-widest">
                  <th className="py-2 font-normal">Size</th>
                  <th className="py-2 font-normal">Chest (in)</th>
                  <th className="py-2 font-normal">Length (in)</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([size, chest, length]) => (
                  <tr key={size} className="border-t border-panel-2 text-paper">
                    <td className="py-2.5 text-acid">{size}</td>
                    <td>{chest}</td>
                    <td>{length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate leading-relaxed mt-4">
              Our tees are cut oversized with a dropped shoulder. Between two sizes? Go down one for a regular fit, stay true to size for the intended relaxed look. Measurements are approximate garment sizes and can vary by about 1 inch.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
