import { useEffect, useRef, useState } from 'react'
import client from '../../api/client'

// Same viewBox + garment geometry for both sides: 500x640, oversized dropped-shoulder tee.
export const BODY_FRONT = 'M195,65 C195,45 212,34 250,34 C288,34 305,45 305,65 L385,90 C415,102 435,125 442,155 L458,195 C462,208 456,222 440,230 C415,240 400,242 395,255 L395,565 C395,580 385,590 370,590 L130,590 C115,590 105,580 105,565 L105,255 C100,242 85,240 60,230 C44,222 38,208 42,195 L58,155 C65,125 85,102 115,90 Z'
const BODY_BACK = 'M195,50 C195,36 212,28 250,28 C288,28 305,36 305,50 L385,90 C415,102 435,125 442,155 L458,195 C462,208 456,222 440,230 C415,240 400,242 395,255 L395,565 C395,580 385,590 370,590 L130,590 C115,590 105,580 105,565 L105,255 C100,242 85,240 60,230 C44,222 38,208 42,195 L58,155 C65,125 85,102 115,90 Z'
export const COLLAR_FRONT = 'M205,52 C222,64 278,64 295,52 C298,68 292,80 250,86 C208,80 202,68 205,52 Z'
const COLLAR_BACK = 'M203,40 C220,50 280,50 297,40 C298,52 291,62 250,66 C209,62 202,52 203,40 Z'
export const NECKHOLE_FRONT = 'M200,46 C220,60 280,60 300,46 C302,60 294,74 250,80 C206,74 198,60 200,46 Z'
const NECKHOLE_BACK = 'M198,34 C218,46 282,46 302,34 C303,46 294,58 250,62 C206,58 197,46 198,34 Z'

const FITBOX = {
  front: { x: 130, y: 150, w: 240, h: 390 },
  back: { x: 130, y: 130, w: 240, h: 390 },
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif'

export function getLuminance(hex) {
  const clean = (hex || '').replace('#', '')
  if (clean.length !== 6) return 0
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// Picks a stage background that contrasts with the garment color, so a black
// tee doesn't disappear into a dark card and a white tee doesn't wash out
// against a light one.
export function getStageBg(hex) {
  if (!hex) return '#F4F2ED'
  return getLuminance(hex) < 0.45 ? '#F4F2ED' : '#17171A'
}

function emptySide(side) {
  const box = FITBOX[side]
  return {
    dataUrl: null, file_url: null, file_name: '', file_type: 'image', userNotes: '',
    uploading: false, error: null,
    tx: box.x + box.w / 2, ty: box.y + box.h / 2, scale: 1, baseW: 0, baseH: 0,
  }
}

function svgPoint(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svgEl.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const loc = pt.matrixTransform(ctm.inverse())
  return { x: loc.x, y: loc.y }
}

// Keep the design's centre on the garment so it can't be dragged away and lost
const DRAG_BOUNDS = { minX: 105, maxX: 395, minY: 60, maxY: 590 }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
export const MIN_SCALE = 0.4
export const MAX_SCALE = 2

function ShirtFace({ side, colorHex, canvasState, onDrag, onScale }) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const pointers = useRef(new Map())   // active touches/mouse, for drag and two-finger pinch
  const pinchRef = useRef(null)
  const body = side === 'front' ? BODY_FRONT : BODY_BACK
  const collar = side === 'front' ? COLLAR_FRONT : COLLAR_BACK
  const neckhole = side === 'front' ? NECKHOLE_FRONT : NECKHOLE_BACK
  const s = canvasState
  const w = s.baseW * s.scale
  const h = s.baseH * s.scale
  const placeholderFill = getLuminance(colorHex) < 0.45 ? '#ffffff' : '#000000'
  const hasDesign = Boolean(s.dataUrl)

  // Mobile browsers ignore touch-action on SVG child elements, so while a finger is moving the
  // design we cancel the page scroll ourselves. This listener must be non-passive to be allowed to.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return undefined
    const stopScroll = (e) => { if (dragRef.current || pinchRef.current) e.preventDefault() }
    el.addEventListener('touchmove', stopScroll, { passive: false })
    return () => el.removeEventListener('touchmove', stopScroll)
  }, [])

  const distance = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function handlePointerDown(e) {
    if (!hasDesign) return
    const p = svgPoint(svgRef.current, e.clientX, e.clientY)
    pointers.current.set(e.pointerId, p)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (pointers.current.size === 2) {
      // second finger down: switch from dragging to pinch-resizing
      dragRef.current = null
      pinchRef.current = { startDist: distance(), startScale: s.scale }
    } else if (pointers.current.size === 1) {
      dragRef.current = { startX: p.x, startY: p.y, startTx: s.tx, startTy: s.ty }
    }
    e.stopPropagation()
  }
  function handlePointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return
    const p = svgPoint(svgRef.current, e.clientX, e.clientY)
    pointers.current.set(e.pointerId, p)
    if (pinchRef.current && pointers.current.size === 2) {
      const ratio = distance() / (pinchRef.current.startDist || 1)
      onScale(clamp(pinchRef.current.startScale * ratio, MIN_SCALE, MAX_SCALE))
    } else if (dragRef.current) {
      const d = dragRef.current
      onDrag(clamp(d.startTx + (p.x - d.startX), DRAG_BOUNDS.minX, DRAG_BOUNDS.maxX), clamp(d.startTy + (p.y - d.startY), DRAG_BOUNDS.minY, DRAG_BOUNDS.maxY))
    }
    e.stopPropagation()
  }
  function handlePointerUp(e) {
    pointers.current.delete(e.pointerId)
    pinchRef.current = null
    if (pointers.current.size === 1) {
      // one finger lifted after a pinch: carry on dragging with the remaining finger
      const [p] = [...pointers.current.values()]
      dragRef.current = { startX: p.x, startY: p.y, startTx: s.tx, startTy: s.ty }
    } else {
      dragRef.current = null
    }
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 500 640"
      className="w-full h-full select-none"
      style={{ filter: 'drop-shadow(0 18px 22px rgba(0,0,0,0.35))', touchAction: hasDesign ? 'none' : 'pan-y', cursor: hasDesign ? 'grab' : 'default', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      aria-label={hasDesign ? 'Design preview. Drag to move; pinch with two fingers to resize.' : 'T-shirt preview'}
      role="img"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <defs>
        <clipPath id={`bodyclip-${side}`}><path d={body} /></clipPath>
        <radialGradient id={`light-${side}`} cx="38%" cy="10%" r="80%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`edge-${side}`} cx="50%" cy="42%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.25" />
        </radialGradient>
        <linearGradient id={`sheen-${side}`} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      <path d={body} fill={colorHex} />

      <g
        clipPath={`url(#bodyclip-${side})`}
        style={{ cursor: hasDesign ? 'grab' : 'default' }}
        pointerEvents="none"
      >
        {s.dataUrl && (
          <image href={s.dataUrl} x={s.tx - w / 2} y={s.ty - h / 2} width={w} height={h} preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'all' }} draggable={false} />
        )}
      </g>
      {!s.dataUrl && (
        <text x="250" y={side === 'front' ? 360 : 330} textAnchor="middle" fill={placeholderFill} fillOpacity="0.35" fontFamily="var(--font-mono)" fontSize="14" fontWeight="600">
          upload a design
        </text>
      )}

      <path d={body} fill={`url(#light-${side})`} style={{ mixBlendMode: 'soft-light', pointerEvents: 'none' }} clipPath={`url(#bodyclip-${side})`} />
      <path d={body} fill={`url(#edge-${side})`} style={{ mixBlendMode: 'multiply', pointerEvents: 'none' }} clipPath={`url(#bodyclip-${side})`} />
      <path d={body} fill={`url(#sheen-${side})`} style={{ mixBlendMode: 'soft-light', pointerEvents: 'none' }} clipPath={`url(#bodyclip-${side})`} />

      <path d={neckhole} fill="#000" opacity="0.35" />
      <path d={collar} fill={colorHex} />
      <path d={collar} fill="#000" opacity="0.08" style={{ mixBlendMode: 'multiply' }} />
    </svg>
  )
}

export default function TshirtCustomizer({ colors, selections, designs, setDesigns }) {
  const selectedColors = selections
    .map((sel) => colors.find((c) => c.id === sel.color_id))
    .filter(Boolean)

  const [side, setSide] = useState('front')
  const [previewColorId, setPreviewColorId] = useState(selectedColors[0]?.id ?? null)
  const previewColor = selectedColors.find((c) => c.id === previewColorId) || selectedColors[0] || colors[0]

  const [canvas, setCanvas] = useState(() => {
    const init = { front: emptySide('front'), back: emptySide('back') }
    designs.forEach((d) => {
      if (init[d.print_area]) {
        init[d.print_area] = {
          ...init[d.print_area],
          dataUrl: d.file_url,
          file_url: d.file_url,
          file_name: d.file_name,
          file_type: d.file_type,
        }
      }
    })
    return init
  })

  const fileInputRef = useRef(null)

  // Hydrate base image dimensions for designs restored from a previous visit to this step.
  useEffect(() => {
    Object.keys(canvas).forEach((sd) => {
      const s = canvas[sd]
      if (s.file_url && !s.baseW) {
        const img = new Image()
        img.onload = () => {
          const box = FITBOX[sd]
          const fit = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight)
          setCanvas((cc) => ({ ...cc, [sd]: { ...cc[sd], baseW: img.naturalWidth * fit, baseH: img.naturalHeight * fit } }))
        }
        img.src = s.file_url
      }
    })
    // Runs once on mount to hydrate any designs carried over from a previous step visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the parent order state in sync with whatever is placed on each side.
  useEffect(() => {
    const next = []
    Object.keys(canvas).forEach((sd) => {
      const s = canvas[sd]
      if (!s.file_url) return
      const box = FITBOX[sd]
      const xPct = Math.round(((s.tx - box.x) / box.w) * 100)
      const yPct = Math.round(((s.ty - box.y) / box.h) * 100)
      const placement = `Placement: ~${xPct}% across, ${yPct}% down · size ${Math.round(s.scale * 100)}%`
      next.push({
        file_url: s.file_url,
        file_name: s.file_name,
        file_type: s.file_type,
        print_area: sd,
        notes: s.userNotes ? `${s.userNotes} | ${placement}` : placement,
      })
    })
    setDesigns(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas])

  function updateSide(sd, patch) {
    setCanvas((c) => ({ ...c, [sd]: { ...c[sd], ...(typeof patch === 'function' ? patch(c[sd]) : patch) } }))
  }

  function handleFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const box = FITBOX[side]
        const fit = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight)
        updateSide(side, {
          dataUrl: ev.target.result,
          baseW: img.naturalWidth * fit,
          baseH: img.naturalHeight * fit,
          tx: box.x + box.w / 2,
          ty: box.y + box.h / 2,
          scale: 1,
          uploading: true,
          error: null,
        })
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('print_area', side)
    client.post('/api/custom/designs/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((res) => {
        updateSide(side, { uploading: false, file_url: res.data.file_url, file_name: res.data.file_name, file_type: res.data.file_type })
      })
      .catch((err) => {
        updateSide(side, { uploading: false, error: err.response?.data?.detail || 'Upload failed', dataUrl: null, file_url: null })
      })
  }

  function removeDesign() {
    updateSide(side, emptySide(side))
  }

  function resetPosition() {
    const box = FITBOX[side]
    updateSide(side, { tx: box.x + box.w / 2, ty: box.y + box.h / 2, scale: 1 })
  }

  const s = canvas[side]

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      {/* Stage */}
      <div>
        <div className="flex gap-2 mb-4" role="tablist" aria-label="Shirt side">
          {['front', 'back'].map((sd) => (
            <button key={sd} type="button" role="tab" aria-selected={side === sd} onClick={() => setSide(sd)}
              className={`flex-1 py-2.5 border font-mono text-xs uppercase tracking-widest transition-colors ${side === sd ? 'border-acid text-acid bg-acid/5' : 'border-panel-2 text-slate hover:border-paper'}`}>
              {sd}
            </button>
          ))}
        </div>

        <div className="border border-panel-2 bg-panel p-4 sm:p-6">
          <div className="relative w-full max-w-sm mx-auto aspect-[5/6.2]" style={{ backgroundColor: getStageBg(previewColor?.hex_code) }}>
            <ShirtFace
              key={side}
              side={side}
              colorHex={previewColor?.hex_code || '#1A1A1A'}
              canvasState={s}
              onDrag={(tx, ty) => updateSide(side, { tx, ty })}
              onScale={(scale) => updateSide(side, { scale })}
            />
          </div>
          <p className="text-center font-mono text-[10.5px] text-slate mt-3">
            {s.dataUrl ? 'drag to move · pinch with two fingers or use the slider to resize' : 'upload artwork below to place it here'}
          </p>
        </div>

        {selectedColors.length > 1 && (
          <div className="mt-4">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-2">Previewing color</span>
            <div className="flex flex-wrap gap-2">
              {selectedColors.map((c) => (
                <button key={c.id} type="button" onClick={() => setPreviewColorId(c.id)}
                  className={`w-8 h-8 rounded-full border-2 ${previewColorId === c.id ? 'border-acid' : 'border-transparent'}`}
                  style={{ backgroundColor: c.hex_code, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.2)' }}
                  title={c.name} aria-label={`Preview ${c.name}`} />
              ))}
            </div>
            <p className="font-mono text-[10.5px] text-slate mt-2">Your design prints on every color in this order — this only changes what you see here.</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border border-panel-2 p-6 sm:p-8">
        <h2 className="font-mono text-xs uppercase tracking-widest text-acid mb-1">Your design — {side}</h2>
        <p className="font-mono text-[11px] text-slate mb-6">Upload a PNG or JPG, then drag it anywhere on the shirt. Front and back keep their own artwork and placement.</p>

        <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="hidden"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = '' }} />

        {!s.dataUrl ? (
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-4 border border-dashed border-panel-2 hover:border-acid/60 transition-colors font-mono text-xs uppercase tracking-widest text-slate">
            + Upload artwork for {side}
          </button>
        ) : (
          <div className="flex items-center gap-3 border border-panel-2 p-3">
            <img src={s.dataUrl} alt="" className="w-12 h-12 object-cover border border-panel-2 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-paper truncate">{s.uploading ? 'Uploading…' : (s.file_name || 'design')}</p>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-acid mt-1">Replace</button>
            </div>
            <button type="button" onClick={removeDesign} className="font-mono text-[10px] uppercase tracking-widest text-slate hover:text-riot flex-shrink-0">Remove</button>
          </div>
        )}

        {s.error && <p className="text-riot font-mono text-xs mt-3">{s.error}</p>}

        {s.dataUrl && (
          <>
            <label className="block mt-6">
              <span className="flex justify-between font-mono text-[11px] uppercase tracking-widest text-slate mb-2">
                <span>Size</span><span>{Math.round(s.scale * 100)}%</span>
              </span>
              <input type="range" min={MIN_SCALE * 100} max={MAX_SCALE * 100} step="1" value={Math.round(s.scale * 100)} aria-label="Design size" 
                onChange={(e) => updateSide(side, { scale: Number(e.target.value) / 100 })}
                className="w-full accent-acid" />
            </label>

            <label className="block mt-5">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-2">Notes for printer (optional)</span>
              <input type="text" value={s.userNotes} placeholder="e.g. keep colors bright"
                onChange={(e) => updateSide(side, { userNotes: e.target.value })}
                className="w-full bg-ink border border-panel-2 px-3 py-2.5 text-sm text-paper font-mono focus:border-acid outline-none" />
            </label>

            <button type="button" onClick={resetPosition} className="font-mono text-[11px] uppercase tracking-widest text-slate underline mt-4 hover:text-paper">
              Reset position
            </button>
          </>
        )}

        <div className="mt-6 pt-5 border-t border-panel-2 font-mono text-[10.5px] text-slate">
          {['front', 'back'].filter((sd) => canvas[sd].file_url).length} of 2 sides have artwork
        </div>
      </div>
    </div>
  )
}
