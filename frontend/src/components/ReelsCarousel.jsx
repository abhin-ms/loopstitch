import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../api/client'
import { SOCIAL } from '../utils/social'
import { InstagramIcon } from './SocialLinks'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// One reel: plays muted on a loop while it is on screen, pauses when it scrolls away.
// Only an "Instagram" label is shown (no profile details); the whole card opens the post.
function ReelCard({ video }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play().catch(() => { /* autoplay blocked: stays on first frame */ })
      else el.pause()
    }, { threshold: 0.6 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <a
      href={video.link_url || SOCIAL.instagram.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Watch this reel on Instagram (opens in a new tab)"
      className="relative block w-[68vw] max-w-[280px] sm:w-[260px] shrink-0 snap-start aspect-[9/16] overflow-hidden bg-panel border border-panel-2"
    >
      <video
        ref={ref}
        src={`${mediaUrl(video.video_url)}#t=0.1`}
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-widest">
        <InstagramIcon size={14} />
        Instagram
      </span>
    </a>
  )
}

export default function ReelsCarousel({ videos }) {
  const scroller = useRef(null)
  const scrollBy = (dir) => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={scroller}
        className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth scroll-px-5 sm:scroll-px-0 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-label="Instagram reels"
        tabIndex={0}
      >
        {videos.map((v) => <ReelCard key={v.id} video={v} />)}
      </div>
      {videos.length > 2 && (
        <div className="hidden md:flex gap-2 mt-4">
          <button onClick={() => scrollBy(-1)} aria-label="Previous reels" className="w-11 h-11 border border-panel-2 text-paper hover:border-acid hover:text-acid transition-colors">←</button>
          <button onClick={() => scrollBy(1)} aria-label="Next reels" className="w-11 h-11 border border-panel-2 text-paper hover:border-acid hover:text-acid transition-colors">→</button>
        </div>
      )}
    </div>
  )
}
