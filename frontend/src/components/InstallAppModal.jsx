import { motion, AnimatePresence } from 'framer-motion'

// iOS/Safari never fires `beforeinstallprompt` — this is the manual
// "Add to Home Screen" walkthrough shown instead.
export default function InstallAppModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="relative bg-panel border border-panel-2 p-6 sm:p-8 w-full max-w-sm space-y-5"
          >
            <h2 className="font-display text-2xl uppercase text-paper">Add to Home Screen</h2>
            <p className="font-mono text-xs text-slate leading-relaxed">
              iOS doesn't support one-tap install yet — it takes three taps in Safari:
            </p>
            <ol className="space-y-3 font-mono text-xs text-paper/90 list-none">
              <li>
                <span className="text-acid font-bold mr-1.5">1.</span>
                Tap the <strong className="text-paper">Share</strong> icon (square with an arrow) in Safari's toolbar.
              </li>
              <li>
                <span className="text-acid font-bold mr-1.5">2.</span>
                Scroll down and tap <strong className="text-paper">Add to Home Screen</strong>.
              </li>
              <li>
                <span className="text-acid font-bold mr-1.5">3.</span>
                Tap <strong className="text-paper">Add</strong> — the Loopstitch app icon appears on your home screen.
              </li>
            </ol>
            <button
              onClick={onClose}
              className="w-full bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
