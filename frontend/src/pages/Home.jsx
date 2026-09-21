import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import client, { mediaUrl } from '../api/client'
import ProductCard from '../components/ProductCard'
import ProductSkeleton from '../components/ProductSkeleton'
import TrustStrip from '../components/TrustStrip'
import NewsletterForm from '../components/NewsletterForm'
import StarRating from '../components/StarRating'
import OfferBanner from '../components/OfferBanner'
import InstagramSection from '../components/InstagramSection'
import SocialSection from '../components/SocialSection'

const reveal = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
}

export default function Home() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState([])
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    document.title = 'Loopstitch Co. | Wear a drop. Or wear your own.'
    return () => { document.title = 'Loopstitch Co.' }
  }, [])

  useEffect(() => {
    client
      .get('/api/products', { params: { featured: true } })
      .then((res) => setProducts(res.data))
      .catch((err) => { console.error('Featured fetch failed:', err); setProducts([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    client.get('/api/reviews/featured').then((res) => setReviews(res.data)).catch(() => {})
  }, [])

  const heroImages = products
    .map((p) => (p.colors?.[0]?.images?.[0] || p.images?.[0])?.url)
    .filter(Boolean)
    .slice(0, 3)

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 screentone" />
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20 lg:py-24 relative grid lg:grid-cols-[1.25fr_1fr] gap-12 items-center">
          <div>
          <motion.p
            initial={reduceMotion ? false : 'hidden'} animate="visible" variants={reveal}
            transition={{ duration: 0.45 }}
            className="font-mono text-xs text-riot tracking-[0.22em] uppercase mb-5"
          >
            Limited drops · Custom prints
          </motion.p>

          <motion.h1
            initial={reduceMotion ? false : 'hidden'} animate="visible" variants={reveal}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="font-display uppercase text-paper leading-[0.92] text-[15vw] sm:text-[9vw] lg:text-[7.5rem] max-w-5xl"
          >
            Wear a drop.
            <br />
            <span className="text-riot">Or wear your own.</span>
          </motion.h1>

          <motion.p
            initial={reduceMotion ? false : 'hidden'} animate="visible" variants={reveal}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-6 max-w-2xl text-paper/70 text-sm sm:text-base leading-relaxed"
          >
            Limited anime-inspired tees, printed in small batches and never restocked — or bring your own design and we&apos;ll print it on premium cotton. Same quality, either way.
          </motion.p>

          <motion.div
            initial="hidden" animate="visible" variants={reveal}
            transition={{ duration: 0.5, delay: 0.28 }}
            className="mt-8 grid sm:grid-cols-2 gap-3 max-w-xl"
          >
            <Link to="/shop" className="group border border-riot bg-riot text-ink px-5 py-4 transition-colors hover:bg-acid hover:border-acid">
              <span className="font-mono text-xs uppercase tracking-widest">Shop the drops</span>
              <span className="block mt-2 text-xs opacity-70 group-hover:opacity-100">Limited runs · no restocks →</span>
            </Link>
            <Link to="/customize" className="group border border-panel-2 bg-panel/70 text-paper px-5 py-4 transition-colors hover:border-acid hover:text-acid">
              <span className="font-mono text-xs uppercase tracking-widest">Start a custom print</span>
              <span className="block mt-2 text-xs text-slate group-hover:text-acid/80">Your design · your tee →</span>
            </Link>
          </motion.div>
          </div>

          {heroImages.length > 0 && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
              className="relative hidden lg:block h-[34rem]" aria-hidden="true"
            >
              {heroImages.map((url, i) => (
                <div
                  key={url}
                  className="absolute w-[58%] aspect-[4/5] overflow-hidden border border-panel-2 shadow-2xl bg-panel"
                  style={{ top: `${i * 9}%`, left: `${i * 21}%`, transform: `rotate(${(i - 1) * 4}deg)`, zIndex: i }}
                >
                  <img src={mediaUrl(url)} alt="" className="w-full h-full object-cover" fetchPriority={i === 0 ? 'high' : undefined} decoding="async" />
                </div>
              ))}
              <span className="sticker absolute -bottom-2 right-2 z-10 bg-acid text-ink font-mono text-[11px] font-bold px-3 py-1.5 uppercase tracking-wider">
                Drop 001 · Live
              </span>
            </motion.div>
          )}
        </div>
      </section>

      <TrustStrip />
      <OfferBanner />

      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <motion.div
          initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={reveal}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-between gap-4 mb-10"
        >
          <div>
            <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">The drops</p>
            <h2 className="font-display text-3xl sm:text-5xl uppercase text-paper">Drop 001 — 100 pieces, then gone</h2>
            <p className="text-sm text-slate mt-3 max-w-xl">Original anime art, drawn in-house. Once a size sells out, it is retired — not restocked.</p>
          </div>
          <Link to="/shop" className="font-mono text-xs uppercase tracking-widest text-slate hover:text-acid transition-colors py-2">
            View the drop →
          </Link>
        </motion.div>

        {loading ? (
          <ProductSkeleton count={4} />
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-slate font-mono text-sm">
            No products yet — add some from the admin dashboard.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10 sm:gap-y-12">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </section>

      <section className="border-y border-panel-2 bg-panel/45">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-20 items-start">
          <motion.div initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.2 }} variants={reveal} transition={{ duration: 0.5 }}>
            <p className="font-mono text-xs text-acid tracking-widest uppercase mb-2">The custom studio</p>
            <h2 className="font-display text-4xl sm:text-6xl uppercase text-paper leading-none">Or print exactly what you want.</h2>
            <p className="text-sm sm:text-base text-paper/70 leading-relaxed mt-5 max-w-xl">
              Upload your artwork, logo, photo, or an idea you&apos;ve been sitting on. We print it on a premium tee, with custom orders starting from the minimum quantity set by our team.
            </p>
            <Link to="/customize" className="inline-block mt-7 bg-acid text-ink font-mono text-xs uppercase tracking-widest px-6 py-3.5 hover:bg-riot transition-colors">
              Start your custom order →
            </Link>
          </motion.div>

          <div className="grid sm:grid-cols-3 lg:grid-cols-1 gap-4">
            {[
              ['01', 'Send your design', 'Upload artwork or tell us what you are picturing.'],
              ['02', 'We print it', 'Printed on 240 GSM heavyweight cotton, the same process as the drops.'],
              ['03', 'It ships', 'Printed, packed and shipped, tracked door to door.'],
            ].map(([number, title, copy], index) => (
              <motion.div
                key={number}
                initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={reveal}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="border-l-2 border-acid pl-4 py-1"
              >
                <span className="font-mono text-[10px] text-acid tracking-widest">{number}</span>
                <h3 className="font-display text-2xl uppercase text-paper mt-1">{title}</h3>
                <p className="text-sm text-slate leading-relaxed mt-1">{copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">Why Loopstitch</p>
        <div className="grid sm:grid-cols-3 gap-8 sm:gap-10">
          {[
            ['Draw', 'Whether it is our drop art or your own file, nothing goes to print without being checked first.'],
            ['Print', 'Premium print on 240 GSM heavyweight cotton. A better feel and a finish built for regular wear.'],
            ['Ship', 'Printed and shipped with tracking, from our door to yours.'],
          ].map(([label, copy], index) => (
            <motion.div key={label} initial={reduceMotion ? false : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={reveal} transition={{ duration: 0.45, delay: index * 0.08 }}>
              <h3 className="font-display text-2xl uppercase text-acid mb-2">{label}</h3>
              <p className="text-sm text-paper/70 leading-relaxed">{copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <InstagramSection />

      {reviews.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24" aria-labelledby="home-reviews">
          <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">On the streets</p>
          <h2 id="home-reviews" className="font-display text-3xl sm:text-5xl uppercase text-paper mb-8">What wearers say</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {reviews.slice(0, 3).map((r) => (
              <figure key={r.id} className="border border-panel-2 p-5">
                <StarRating value={r.rating} />
                <blockquote className="text-sm text-paper/80 leading-relaxed mt-3">{r.body || r.title}</blockquote>
                <figcaption className="font-mono text-[11px] text-slate mt-3 uppercase tracking-wider">{r.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <SocialSection />

      <section className="max-w-7xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="border border-panel-2 p-6 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <p className="font-mono text-xs text-acid tracking-widest uppercase mb-2">For the next drop</p>
            <h2 className="font-display text-3xl sm:text-4xl uppercase text-paper">Get notified before it goes live.</h2>
            <p className="text-sm text-slate mt-2">No spam — just a heads-up before the next limited run.</p>
          </div>
          <NewsletterForm source="home" />
        </div>
      </section>
    </div>
  )
}
