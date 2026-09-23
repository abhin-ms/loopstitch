import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SIZE_CHART, recommendSize } from '../utils/sizing'

export default function SizeGuide({ open, onClose, onPick, available }) {
  const closeRef = useRef(null)
  const [chest, setChest] = useState('')
  const [fit, setFit] = useState('oversized')
  const suggestion = recommendSize(chest, fit)
  const suggestionAvailable = !available || available.includes(suggestion)

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
          className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-5"
          onClick={onClose}
        >
          <div
            role="dialog" aria-modal="true" aria-labelledby="size-guide-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-panel border border-panel-2 p-5 sm:p-6"
          >
            <div className="flex items-start justify-between mb-1">
              <h2 id="size-guide-title" className="font-display text-2xl uppercase text-paper">Size guide</h2>
              <button ref={closeRef} onClick={onClose} aria-label="Close size guide" className="text-slate hover:text-paper w-11 h-11 -mt-2 -mr-2 flex items-center justify-center">✕</button>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-acid mb-4">Unisex · Oversized, dropped-shoulder fit</p>

            {/* Fit finder */}
            <div className="border border-panel-2 p-4 mb-5">
              <p className="font-mono text-xs uppercase tracking-widest text-paper mb-3">Find your size</p>
              <label className="field-label" htmlFor="fit-chest">Your chest (inches, around the fullest part)</label>
              <input id="fit-chest" type="number" inputMode="decimal" min="20" max="70" value={chest} onChange={(e) => setChest(e.target.value)} placeholder="e.g. 38" className="field-input mb-3" />
              <span className="field-label">How do you like it to fit?</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Preferred fit">
                {[['oversized', 'Oversized', 'The intended boxy look'], ['relaxed', 'Relaxed', 'Roomy, less boxy']].map(([value, label, hint]) => (
                  <button key={value} type="button" role="radio" aria-checked={fit === value} onClick={() => setFit(value)}
                    className={`border px-3 py-2.5 text-left ${fit === value ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper'}`}>
                    <span className="block font-mono text-xs uppercase tracking-widest">{label}</span>
                    <span className="block text-[11px] mt-0.5 opacity-80">{hint}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 min-h-6" aria-live="polite">
                {chest && suggestion && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-mono text-sm text-paper">We suggest <span className="text-acid text-lg">{suggestion}</span></p>
                    {onPick && suggestionAvailable && (
                      <button type="button" onClick={() => { onPick(suggestion); onClose() }} className="bg-riot text-ink font-mono text-[11px] uppercase tracking-widest px-3 py-2 hover:bg-acid transition-colors">
                        Select {suggestion}
                      </button>
                    )}
                    {!suggestionAvailable && <span className="font-mono text-[11px] text-riot">Sold out in this colour</span>}
                  </div>
                )}
                {chest && !suggestion && (
                  <p className="font-mono text-xs text-slate">We don&apos;t have a size that gives that fit. Email hello@loopstitch.online and we&apos;ll help.</p>
                )}
              </div>
            </div>

            <table className="w-full font-mono text-sm">
              <caption className="sr-only">Garment measurements in inches</caption>
              <thead>
                <tr className="text-left text-slate text-[11px] uppercase tracking-widest">
                  <th className="py-2 font-normal">Size</th>
                  <th className="py-2 font-normal">Chest (in)</th>
                  <th className="py-2 font-normal">Length (in)</th>
                </tr>
              </thead>
              <tbody>
                {SIZE_CHART.map((row) => (
                  <tr key={row.size} className={`border-t border-panel-2 ${row.size === suggestion ? 'text-acid' : 'text-paper'}`}>
                    <td className="py-2.5 text-acid">{row.size}</td>
                    <td>{row.chest}</td>
                    <td>{row.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-slate leading-relaxed mt-4 space-y-2">
              <p>These are garment measurements (the tee laid flat, doubled), not body measurements.</p>
              <p><span className="text-paper">Unisex sizing:</span> most people wear their usual size for the oversized look. If you normally buy women&apos;s sizes, go one size down for a relaxed fit, or stay at your usual unisex size for a boxy fit.</p>
              <p>Measurements can vary by about 1 inch.</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
