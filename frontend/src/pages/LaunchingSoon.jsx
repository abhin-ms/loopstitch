import { useEffect, useState } from 'react'
import NewsletterForm from '../components/NewsletterForm'
import SocialLinks from '../components/SocialLinks'
import '../components/launch.css'

const TITLE = 'LAUNCHING SOON'
const MARQUEE = ['Oversized anime tees', 'Stitched with love', 'S · M · L · XL', 'First drop loading', 'Custom prints']

const IST = 'Asia/Kolkata'

function timeLeft(target) {
  const ms = target - Date.now()
  if (ms <= 0) return null
  return {
    Days: Math.floor(ms / 86400000),
    Hours: Math.floor(ms / 3600000) % 24,
    Mins: Math.floor(ms / 60000) % 60,
    Secs: Math.floor(ms / 1000) % 60,
  }
}

// "Launching tomorrow · 7:00 PM IST" — the day word is worked out in India time
function launchLabel(target) {
  const dayKey = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: IST })
  const day = dayKey(target)
  const when = day === dayKey(Date.now())
    ? 'today'
    : day === dayKey(Date.now() + 86400000)
      ? 'tomorrow'
      : new Date(target).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })
  const time = new Date(target).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).toUpperCase()
  return { when, time: `${time} IST` }
}

// Manga-panel countdown card: logo, launch day/time, popping digits over spinning speed lines.
// If the countdown hits zero while someone is watching, it shouts WE'RE LIVE and reloads into the store.
function LaunchCard({ date }) {
  const target = new Date(date).getTime()
  const valid = !Number.isNaN(target)
  const [left, setLeft] = useState(() => (valid ? timeLeft(target) : null))
  const [justWentLive, setJustWentLive] = useState(false)

  useEffect(() => {
    if (!valid) return undefined
    const id = setInterval(() => {
      const next = timeLeft(target)
      setLeft(next)
      if (!next) {
        clearInterval(id)
        setJustWentLive(true)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [target, valid])

  useEffect(() => {
    if (!justWentLive) return undefined
    const id = setTimeout(() => window.location.reload(), 2500)
    return () => clearTimeout(id)
  }, [justWentLive])

  if (!valid) return null
  const { when, time } = launchLabel(target)

  return (
    <section className="launch-card relative w-full max-w-md overflow-hidden border-2 border-paper bg-panel text-left" aria-label={`Launching ${when} at ${time}`}>
      <div className="launch-speedlines" aria-hidden="true" />
      <div className="screentone absolute inset-0" aria-hidden="true" />
      <span className="launch-kanji" aria-hidden="true">発売</span>

      <div className="relative flex items-center justify-between gap-3 px-3 sm:px-4 pt-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo-dark.webp?v=2" alt="" width="256" height="256" className="h-7 w-7 sm:h-8 sm:w-8 object-contain shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-acid">Loopstitch · Drop 001</p>
            <p className="font-display uppercase text-paper text-lg sm:text-2xl leading-tight">Launching {when}</p>
          </div>
        </div>
        <span className="launch-sticker shrink-0 bg-acid text-ink font-display uppercase text-base sm:text-xl leading-none px-2 py-1.5 whitespace-nowrap">
          {left ? time : 'Live'}
        </span>
      </div>

      {left ? (
        <div className="relative flex items-stretch justify-between gap-1 sm:gap-2 px-3 sm:px-4 py-3" role="timer" aria-live="off">
          {/* the day box only matters while it's more than a day away */}
          {Object.entries(left).filter(([label, value]) => label !== 'Days' || value > 0).map(([label, value], i) => (
            <div key={label} className="contents">
              {i > 0 && <span className="launch-colon self-center font-display text-xl sm:text-3xl text-riot" aria-hidden="true">:</span>}
              <div className="flex-1 border border-panel-2 bg-ink/90 py-1.5 sm:py-2 text-center">
                <div key={value} className="launch-digit font-display text-3xl sm:text-5xl text-paper tabular-nums leading-none">
                  {String(value).padStart(2, '0')}
                </div>
                <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-slate mt-1">{label}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="launch-impact relative text-center font-display uppercase text-4xl sm:text-5xl text-acid py-3">
          {justWentLive ? "We're live!" : 'Opening any minute ✦'}
        </p>
      )}

      <p className="relative font-mono text-[9px] sm:text-[10px] uppercase tracking-widest text-slate px-3 sm:px-4 pb-3">
        Unisex oversized anime tees · S · M · L · XL · limited pieces
      </p>
    </section>
  )
}

// Hero: the LS emblem with a stitch ring sewing around it, an orbiting needle bead,
// a breathing red glow and rising sparks. Pure CSS (launch.css), no video to load.
const SPARKS = [
  { left: '18%', top: '62%', delay: '0s' },
  { left: '30%', top: '80%', delay: '1.1s' },
  { left: '52%', top: '86%', delay: '0.5s' },
  { left: '72%', top: '76%', delay: '1.7s' },
  { left: '84%', top: '58%', delay: '0.8s' },
  { left: '64%', top: '22%', delay: '2.2s' },
  { left: '24%', top: '30%', delay: '2.6s' },
]

function LaunchEmblem() {
  return (
    <div className="launch-emblem relative h-full max-h-full max-w-full aspect-square lg:h-auto lg:w-[26rem]" aria-hidden="true">
      <div className="launch-emblem-glow" />
      <svg className="launch-emblem-ring absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="96" fill="none" stroke="var(--color-riot)" strokeWidth="1.4" strokeDasharray="7 5" strokeLinecap="round" />
      </svg>
      <svg className="launch-emblem-ring2 absolute inset-0 w-full h-full" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="91" fill="none" stroke="var(--color-paper)" strokeOpacity="0.18" strokeWidth="0.8" strokeDasharray="2 6" />
      </svg>
      <div className="launch-orbit" />
      {SPARKS.map((spark, i) => (
        <span key={i} className="launch-spark" style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }} />
      ))}
      <img src="/logo-dark.webp?v=2" alt="" width="512" height="512" className="launch-emblem-logo" />
    </div>
  )
}

export default function LaunchingSoon({ date = '', message = '' }) {
  useEffect(() => {
    const prev = document.title
    document.title = 'Launching Soon — Loopstitch'
    // Always dark here so the dark video blends in; restore the visitor's theme on leave
    const root = document.documentElement
    const prevTheme = root.getAttribute('data-theme')
    root.setAttribute('data-theme', 'dark')
    return () => {
      document.title = prev
      if (prevTheme) root.setAttribute('data-theme', prevTheme)
    }
  }, [])

  return (
    <div className="launch-page flex flex-col bg-ink overflow-hidden relative">
      <div className="screentone absolute inset-0" aria-hidden="true" />
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-riot/20 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-40 -right-24 w-[28rem] h-[28rem] rounded-full bg-acid/10 blur-3xl" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-3 sm:py-5">
        <div className="flex items-center gap-3">
          <img src="/logo-dark.webp?v=2" alt="Loopstitch" width="256" height="256" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
          <span className="font-display text-lg sm:text-xl text-paper">LOOPSTITCH<span className="text-riot">.</span></span>
        </div>
        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-widest text-acid flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-acid launch-dot" /> Sewing in progress
        </span>
      </header>

      <main className="relative z-10 flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-2 lg:items-center gap-3 sm:gap-6 lg:gap-10 px-4 sm:px-8 max-w-6xl w-full mx-auto py-2 sm:py-6">
        <div className="order-2 lg:order-1 shrink-0 flex flex-col items-center lg:items-start text-center lg:text-left gap-3 sm:gap-6">
          <p className="launch-short-hide font-mono text-[10px] sm:text-xs uppercase tracking-widest text-riot">
            ✦ Something stylish is being stitched
          </p>
          <h1 className="launch-title font-display text-4xl sm:text-7xl text-paper leading-none" aria-label={TITLE}>
            {TITLE.split('').map((ch, i) => (
              <span key={i} aria-hidden="true" style={{ animationDelay: `${i * 0.08}s` }} className={i >= 10 ? 'text-riot' : ''}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </h1>
          <p className={`text-paper/80 text-sm sm:text-lg max-w-md ${date ? 'launch-hide-with-card' : ''}`}>
            {message || 'Our first drop of unisex oversized anime tees is almost ready. Leave your email or WhatsApp number and be the first to know when we go live.'}
          </p>

          {date && <LaunchCard date={date} />}

          <NewsletterForm source="launch" forgiving />
          <SocialLinks />
        </div>

        {/* phones: takes whatever height is left, so the page never scrolls */}
        <div className="order-1 lg:order-2 flex-1 min-h-0 flex justify-center items-center lg:flex-none">
          <LaunchEmblem />
        </div>
      </main>

      <div className="relative z-10 border-y border-panel-2 bg-riot text-ink py-1.5 sm:py-2 overflow-hidden" aria-hidden="true">
        <div className="launch-marquee">
          {[0, 1].map((n) => (
            <div key={n} className="flex shrink-0">
              {MARQUEE.concat(MARQUEE).map((t, i) => (
                <span key={i} className="font-display uppercase text-base sm:text-lg px-5 sm:px-6 whitespace-nowrap">{t} ✦</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <footer className="launch-short-hide relative z-10 text-center font-mono text-[11px] text-slate py-2 sm:py-4">
        © {new Date().getFullYear()} Loopstitch
      </footer>
    </div>
  )
}
