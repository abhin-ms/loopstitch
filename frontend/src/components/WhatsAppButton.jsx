import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './whatsapp.css'

const NUMBER = '916238860673'  // +91 62388 60673
const HINT_KEY = 'loopstitch_wa_hint_shown'

// Floating "chat on WhatsApp" button for the storefront (not the admin panel): a little
// chibi stitch-ninja that bobs, blinks and waves. On a product page the message mentions it.
export default function WhatsAppButton() {
  const { pathname } = useLocation()
  const [hint, setHint] = useState(false)

  // a one-time "Need help?" bubble per visit, a few seconds after arriving
  useEffect(() => {
    try { if (sessionStorage.getItem(HINT_KEY)) return undefined } catch { return undefined }
    const show = setTimeout(() => {
      setHint(true)
      try { sessionStorage.setItem(HINT_KEY, '1') } catch { /* storage blocked */ }
    }, 4000)
    const hide = setTimeout(() => setHint(false), 10000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])

  const onProduct = pathname.startsWith('/product/')
  const text = onProduct
    ? `Hi Loopstitch! I have a question about this tee: https://loopstitch.online${pathname}`
    : 'Hi Loopstitch! I have a question.'
  const href = `https://wa.me/${NUMBER}?text=${encodeURIComponent(text)}`

  return (
    // on phones the product page has a sticky Add to cart bar at the bottom: sit above it
    <div className={`wa-float fixed right-4 z-40 md:right-6 md:bottom-6 ${onProduct ? 'bottom-24' : 'bottom-5'}`}>
      <span className={`wa-hint ${hint ? 'wa-hint-on' : ''}`} aria-hidden="true">Need help? Chat with us!</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Loopstitch on WhatsApp"
        title="Chat with us on WhatsApp"
        className="wa-btn"
        onMouseEnter={() => setHint(true)}
        onMouseLeave={() => setHint(false)}
      >
        <svg viewBox="0 0 100 100" className="wa-chibi" aria-hidden="true">
          {/* waving hand */}
          <g className="wa-hand">
            <ellipse cx="84" cy="62" rx="7" ry="8" fill="#FFE1CC" stroke="#1B1B22" strokeWidth="2.5" />
          </g>
          {/* hair (back) */}
          <path d="M21 58 C18 36 32 22 50 22 C68 22 82 36 79 58 Z" fill="#1B1B22" />
          {/* face */}
          <ellipse cx="50" cy="60" rx="27" ry="25" fill="#FFE1CC" stroke="#1B1B22" strokeWidth="2.5" />
          {/* spiky fringe */}
          <path d="M23 52 L27 30 L36 42 L40 22 L50 38 L60 22 L64 42 L73 30 L77 52 C70 40 30 40 23 52 Z" fill="#1B1B22" />
          {/* headband with fluttering tails */}
          <path d="M24 44 C38 37 62 37 76 44 L75 50 C61 43 39 43 25 50 Z" fill="#FF3B5C" />
          <g className="wa-tails">
            <path d="M75 45 L92 38 L88 46 L95 50 L76 49 Z" fill="#FF3B5C" />
          </g>
          <circle cx="50" cy="44" r="3.2" fill="#E8FF52" stroke="#1B1B22" strokeWidth="1.2" />
          {/* eyes (blink) */}
          <g className="wa-eyes">
            <ellipse cx="39" cy="61" rx="5.5" ry="7" fill="#1B1B22" />
            <ellipse cx="61" cy="61" rx="5.5" ry="7" fill="#1B1B22" />
            <circle cx="41" cy="58" r="2.2" fill="#fff" />
            <circle cx="63" cy="58" r="2.2" fill="#fff" />
            <circle cx="37.5" cy="64" r="1" fill="#fff" />
            <circle cx="59.5" cy="64" r="1" fill="#fff" />
          </g>
          {/* blush + cat smile */}
          <ellipse cx="31" cy="70" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
          <ellipse cx="69" cy="70" rx="5" ry="3" fill="#FF8FA3" opacity="0.7" />
          <path d="M44 71 q3 4 6 0 q3 4 6 0" fill="none" stroke="#1B1B22" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {/* WhatsApp badge */}
        <span className="wa-badge">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path fill="#fff" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3Z" />
            <path fill="#25D366" d="M16 5.2a10.8 10.8 0 0 0-9.2 16.5l.3.4-1 3.9 4-1 .4.2A10.8 10.8 0 1 0 16 5.2Z" />
            <path fill="#fff" d="M12.2 9.6c-.3-.6-.6-.6-.9-.6h-.7c-.3 0-.7.1-1 .5-.4.4-1.4 1.3-1.4 3.2s1.4 3.7 1.6 4c.2.2 2.7 4.3 6.6 5.8 3.3 1.3 3.9 1 4.6 1 .7-.1 2.3-.9 2.6-1.9.3-.9.3-1.7.2-1.9-.1-.2-.4-.3-.8-.5l-2.7-1.3c-.4-.1-.6-.2-.9.2l-1.2 1.5c-.2.3-.4.3-.8.1-.4-.2-1.6-.6-3.1-1.9-1.1-1-1.9-2.3-2.1-2.7-.2-.4 0-.6.2-.8l.6-.7.4-.6c.1-.3.1-.5 0-.7l-1.3-3.2Z" />
          </svg>
        </span>
      </a>
    </div>
  )
}
