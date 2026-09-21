import { motion, useReducedMotion } from 'framer-motion'
import { SOCIAL } from '../utils/social'
import { InstagramIcon, FacebookIcon } from './SocialLinks'

const ICONS = { instagram: InstagramIcon, facebook: FacebookIcon }
const COPY = {
  instagram: 'New drops, behind-the-scenes and first looks.',
  facebook: 'Updates, announcements and community posts.',
}

export default function SocialSection() {
  const reduceMotion = useReducedMotion()
  return (
    <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24" aria-labelledby="social-title">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45 }}
      >
        <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">Stay in the loop</p>
        <h2 id="social-title" className="font-display text-3xl sm:text-5xl uppercase text-paper mb-8">Follow Loopstitch</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {Object.entries(SOCIAL).map(([key, s]) => {
            const Icon = ICONS[key]
            return (
              <a
                key={key}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Follow Loopstitch on ${s.label} (opens in a new tab)`}
                className="group border border-panel-2 p-5 sm:p-6 flex items-center gap-4 hover:border-acid transition-colors"
              >
                <span className="w-14 h-14 shrink-0 flex items-center justify-center bg-panel border border-panel-2 text-paper group-hover:text-acid group-hover:border-acid transition-colors">
                  <Icon size={26} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-2xl uppercase text-paper">{s.label}</span>
                  <span className="block font-mono text-xs text-acid tracking-wider mt-0.5">{s.handle}</span>
                  <span className="block text-sm text-slate mt-1">{COPY[key]}</span>
                </span>
                <span className="ml-auto font-mono text-slate group-hover:text-acid transition-colors" aria-hidden="true">↗</span>
              </a>
            )
          })}
        </div>
      </motion.div>
    </section>
  )
}
