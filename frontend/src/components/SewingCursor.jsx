import { useEffect, useRef, useState } from 'react'

/**
 * SewingCursor v2 – Elegant embroidery thread trail
 *
 * - Spring-physics follower for buttery smooth motion
 * - Catmull-Rom spline for organic curves
 * - Delicate cross-stitch marks at intervals
 * - Thin gradient thread that fades gracefully
 * - Minimal needle tip
 * - Respects prefers-reduced-motion
 * - Skipped entirely on touch devices (see TouchFeedback for the touch-native version)
 * - Draw loop sleeps once the trail has faded, so an idle page costs nothing
 */
const TOUCH_QUERY = '(hover: none), (pointer: coarse)'

export default function SewingCursor() {
  const [isTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia(TOUCH_QUERY).matches)
  const canvasRef = useRef(null)
  const state = useRef({
    mouse: { x: -200, y: -200 },
    follower: { x: -200, y: -200, vx: 0, vy: 0 },
    trail: [],          // { x, y, time }
    stitchPoints: [],   // { x, y, angle, time }
    active: false,
  })
  const rafRef = useRef(null)

  const TRAIL_MAX = 50
  const TRAIL_LIFE = 1800        // ms before a point fades completely
  const STITCH_SPACING = 40      // px between stitch marks
  const THREAD_HUE = '348'       // riot-red in HSL
  const SPRING_STIFFNESS = 0.08
  const SPRING_DAMPING = 0.78

  /* ── Catmull-Rom helper ─────────────────────────────── */
  const catmullRom = (p0, p1, p2, p3, t) => {
    const t2 = t * t
    const t3 = t2 * t
    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    }
  }

  useEffect(() => {
    if (isTouch || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let dpr = window.devicePixelRatio || 1

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    window.addEventListener('resize', resize)

    let lastStitchDist = 0
    let lastMoveAt = 0
    let running = false

    const handleMouseMove = (e) => {
      state.current.mouse = { x: e.clientX, y: e.clientY }
      state.current.active = true
      lastMoveAt = Date.now()
      if (!running) {
        running = true
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    const handleMouseLeave = () => {
      state.current.active = false
    }

    const tick = () => {
      const s = state.current
      const now = Date.now()

      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

      /* ── Spring physics ─────────────────────────── */
      const dx = s.mouse.x - s.follower.x
      const dy = s.mouse.y - s.follower.y
      s.follower.vx += dx * SPRING_STIFFNESS
      s.follower.vy += dy * SPRING_STIFFNESS
      s.follower.vx *= SPRING_DAMPING
      s.follower.vy *= SPRING_DAMPING
      s.follower.x += s.follower.vx
      s.follower.y += s.follower.vy

      const fx = s.follower.x
      const fy = s.follower.y

      /* ── Accumulate trail points ────────────────── */
      const last = s.trail[s.trail.length - 1]
      if (!last || Math.hypot(fx - last.x, fy - last.y) > 3) {
        s.trail.push({ x: fx, y: fy, time: now })
        if (s.trail.length > TRAIL_MAX) s.trail.shift()

        /* ── Stitch accumulator ────────────────────── */
        if (last) {
          lastStitchDist += Math.hypot(fx - last.x, fy - last.y)
          if (lastStitchDist >= STITCH_SPACING) {
            lastStitchDist = 0
            const angle = Math.atan2(fy - last.y, fx - last.x)
            s.stitchPoints.push({ x: fx, y: fy, angle, time: now })
          }
        }
      }

      // Prune old points
      s.trail = s.trail.filter((p) => now - p.time < TRAIL_LIFE)
      s.stitchPoints = s.stitchPoints.filter((p) => now - p.time < TRAIL_LIFE + 400)

      const pts = s.trail

      /* ── Draw thread with Catmull-Rom splines ───── */
      if (pts.length >= 4) {
        for (let i = 0; i < pts.length - 3; i++) {
          const p0 = pts[i]
          const p1 = pts[i + 1]
          const p2 = pts[i + 2]
          const p3 = pts[i + 3]

          const progress = (i + 1) / (pts.length - 2) // 0..1 along trail
          const age = now - p1.time
          const ageAlpha = Math.max(0, 1 - age / TRAIL_LIFE)
          const alpha = ageAlpha * (0.15 + progress * 0.55) // subtle at tail, stronger at head

          if (alpha <= 0) continue

          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)

          const steps = 8
          for (let t = 1; t <= steps; t++) {
            const pt = catmullRom(p0, p1, p2, p3, t / steps)
            ctx.lineTo(pt.x, pt.y)
          }

          // Thread thickness tapers: thin at tail, thicker at head
          const width = 0.8 + progress * 1.2

          ctx.strokeStyle = `hsla(${THREAD_HUE}, 100%, 62%, ${alpha})`
          ctx.lineWidth = width
          ctx.lineCap = 'round'
          ctx.stroke()
        }

        /* ── Subtle thread glow (only near head) ──── */
        const headPts = pts.slice(-8)
        if (headPts.length >= 2) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(headPts[0].x, headPts[0].y)
          for (let i = 1; i < headPts.length; i++) {
            ctx.lineTo(headPts[i].x, headPts[i].y)
          }
          ctx.strokeStyle = `hsla(${THREAD_HUE}, 100%, 65%, 0.12)`
          ctx.lineWidth = 6
          ctx.shadowColor = `hsla(${THREAD_HUE}, 100%, 55%, 0.25)`
          ctx.shadowBlur = 10
          ctx.lineCap = 'round'
          ctx.stroke()
          ctx.restore()
        }
      }

      /* ── Cross-stitch marks ─────────────────────── */
      for (const sp of s.stitchPoints) {
        const age = now - sp.time
        const alpha = Math.max(0, 1 - age / (TRAIL_LIFE + 400))
        if (alpha <= 0) continue

        const len = 4
        const a1 = sp.angle + Math.PI / 4
        const a2 = sp.angle - Math.PI / 4

        ctx.globalAlpha = alpha * 0.45
        ctx.strokeStyle = `hsla(${THREAD_HUE}, 80%, 70%, 1)`
        ctx.lineWidth = 0.8
        ctx.lineCap = 'round'

        // First slash of the X
        ctx.beginPath()
        ctx.moveTo(sp.x - Math.cos(a1) * len, sp.y - Math.sin(a1) * len)
        ctx.lineTo(sp.x + Math.cos(a1) * len, sp.y + Math.sin(a1) * len)
        ctx.stroke()

        // Second slash of the X
        ctx.beginPath()
        ctx.moveTo(sp.x - Math.cos(a2) * len, sp.y - Math.sin(a2) * len)
        ctx.lineTo(sp.x + Math.cos(a2) * len, sp.y + Math.sin(a2) * len)
        ctx.stroke()

        ctx.globalAlpha = 1
      }

      /* ── Needle tip (minimal) ───────────────────── */
      if (s.active && pts.length > 0) {
        const tip = pts[pts.length - 1]

        // Tiny bright dot
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, 2, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(0, 0%, 100%, 0.7)`
        ctx.fill()

        // Soft ring
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${THREAD_HUE}, 100%, 62%, 0.35)`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // Sleep once the mouse has stopped and everything has faded; a move wakes it again
      if (now - lastMoveAt > 500 && s.trail.length === 0 && s.stitchPoints.length === 0) {
        running = false
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [isTouch])

  if (isTouch) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}
