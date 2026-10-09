import { useEffect, useState } from 'react'
import NewsletterForm from '../components/NewsletterForm'
import SocialLinks from '../components/SocialLinks'
import '../components/launch.css'
// Imported (not served from /public) so every build gives it a content-hashed URL:
// replacing the video changes the URL, so Cloudflare/browser caches can't serve the old one
import launchVideo from '../assets/launch-video.mp4'

const TITLE = 'LAUNCHING SOON'
const MARQUEE = ['Oversized anime tees', 'Stitched with love', 'S · M · L · XL', 'First drop loading', 'Custom prints']

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

function Countdown({ date }) {
  const target = new Date(date).getTime()
  const [left, setLeft] = useState(() => (Number.isNaN(target) ? null : timeLeft(target)))

  useEffect(() => {
    if (Number.isNaN(target)) return
    const id = setInterval(() => setLeft(timeLeft(target)), 1000)
    return () => clearInterval(id)
  }, [target])

  if (!left) return null
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full max-w-md" aria-label="Time until launch">
      {Object.entries(left).map(([label, value]) => (
        <div key={label} className="border border-panel-2 bg-panel/80 py-2 sm:py-3 text-center">
          <div className="font-display text-2xl sm:text-4xl text-paper tabular-nums">{String(value).padStart(2, '0')}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate mt-1">{label}</div>
        </div>
      ))}
    </div>
  )
}

// Silent looping background video, edges faded into the page so it reads
// as part of the design rather than a video player (no controls, no clicks)
function LaunchVideo() {
  return (
    <video
      src={launchVideo}
      className="launch-video h-full w-auto max-w-full aspect-video object-cover lg:h-auto lg:w-full lg:max-w-2xl pointer-events-none select-none"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      controls={false}
      aria-hidden="true"
      tabIndex={-1}
    />
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
          <img src="/logo-dark.webp" alt="Loopstitch" width="256" height="256" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
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
          <p className="text-paper/80 text-sm sm:text-lg max-w-md">
            {message || 'Our first drop of unisex oversized anime tees is almost ready. Leave your email or WhatsApp number and be the first to know when we go live.'}
          </p>

          {date && <Countdown date={date} />}

          <NewsletterForm source="launch" forgiving />
          <SocialLinks />
        </div>

        {/* phones: takes whatever height is left, so the page never scrolls */}
        <div className="order-1 lg:order-2 flex-1 min-h-0 flex justify-center items-center lg:flex-none">
          <LaunchVideo />
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
