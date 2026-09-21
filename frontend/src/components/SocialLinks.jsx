import { SOCIAL } from '../utils/social'

export function InstagramIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function FacebookIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.200-.1-2.300-.1-2.300 0-3.900 1.400-3.900 4v2.200H7.800v3h2.600V21h3.100z" />
    </svg>
  )
}

const ICONS = { instagram: InstagramIcon, facebook: FacebookIcon }

// Compact icon buttons (footer)
export default function SocialLinks({ className = '' }) {
  return (
    <ul className={`flex items-center gap-2 ${className}`} aria-label="Loopstitch on social media">
      {Object.entries(SOCIAL).map(([key, s]) => {
        const Icon = ICONS[key]
        return (
          <li key={key}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Loopstitch on ${s.label} (opens in a new tab)`}
              className="w-11 h-11 flex items-center justify-center border border-panel-2 text-paper/80 hover:text-acid hover:border-acid transition-colors"
            >
              <Icon />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
