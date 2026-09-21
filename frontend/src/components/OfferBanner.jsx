import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import useAnnouncements from '../hooks/useAnnouncements'
import CouponChip from './CouponChip'
import { STYLES } from './AnnouncementBar'

export default function OfferBanner() {
  const reduceMotion = useReducedMotion()
  const items = useAnnouncements().filter((a) => a.placement === 'banner' || a.placement === 'both')
  if (items.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto px-5 sm:px-8 pt-10 sm:pt-14 space-y-4" aria-label="Current offers">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: i * 0.08 }}
          className={`${STYLES[item.style] || STYLES.acid} relative overflow-hidden p-6 sm:p-9 flex flex-col sm:flex-row sm:items-center justify-between gap-5`}
        >
          <div className="absolute inset-0 screentone-red opacity-[0.12] pointer-events-none" aria-hidden="true" />
          <div className="relative">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] font-bold opacity-70 mb-2">Live offer</p>
            <h2 className="font-display uppercase text-3xl sm:text-5xl leading-none">{item.message}</h2>
            {item.detail && <p className="text-sm sm:text-base mt-3 max-w-xl opacity-80">{item.detail}</p>}
          </div>
          <div className="relative flex flex-wrap items-center gap-3 shrink-0">
            {item.coupon_code && <CouponChip code={item.coupon_code} className="text-xs py-2 px-3" />}
            {item.link_url && (item.link_url.startsWith('/') ? (
              <Link to={item.link_url} className="bg-ink text-paper font-mono text-xs uppercase tracking-widest px-6 py-3.5 hover:opacity-80 transition-opacity">{item.link_label || 'Shop now'} →</Link>
            ) : (
              <a href={item.link_url} target="_blank" rel="noopener noreferrer" className="bg-ink text-paper font-mono text-xs uppercase tracking-widest px-6 py-3.5 hover:opacity-80 transition-opacity">{item.link_label || 'Shop now'} →</a>
            ))}
          </div>
        </motion.div>
      ))}
    </section>
  )
}
