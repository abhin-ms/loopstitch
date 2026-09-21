import { useEffect, useRef, useState } from 'react'

const TOUCH_QUERY = '(hover: none), (pointer: coarse)'
const LIFE = 700 // ms a tap stitch stays on screen

/**
 * Touch-native take on the sewing cursor:
 * - a small cross-stitch "X" is sewn where you tap (touch devices only)
 * - a dashed thread along the top edge fills as you scroll (all devices)
 * Both are pointer-events: none and idle when nothing is happening.
 */
export default function TouchFeedback() {
  const [stitches, setStitches] = useState([])
  const threadRef = useRef(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const touch = window.matchMedia(TOUCH_QUERY).matches
    const timers = []
    let frame = 0

    const onPointerDown = (e) => {
      if (e.pointerType !== 'touch') return
      const id = `${e.timeStamp}-${e.clientX}`
      setStitches((prev) => [...prev.slice(-4), { id, x: e.clientX, y: e.clientY }])
      timers.push(setTimeout(() => setStitches((prev) => prev.filter((s) => s.id !== id)), LIFE))
    }

    const updateThread = () => {
      frame = 0
      const el = threadRef.current
      if (!el) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      el.style.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(updateThread) }

    if (touch && !reduced) window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    updateThread()

    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
      timers.forEach(clearTimeout)
    }
  }, [])

  return (
    <>
      <div ref={threadRef} className="scroll-thread" aria-hidden="true" style={{ clipPath: 'inset(0 100% 0 0)' }} />
      {stitches.map((s) => (
        <svg key={s.id} className="tap-stitch" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style={{ left: s.x - 13, top: s.y - 13 }}>
          <path d="M5 5 L21 21" pathLength="1" />
          <path d="M21 5 L5 21" pathLength="1" />
        </svg>
      ))}
    </>
  )
}
