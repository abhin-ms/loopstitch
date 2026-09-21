import { useState } from 'react'

export default function CouponChip({ code, className = '' }) {
  const [copied, setCopied] = useState(false)
  const copy = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked; the code is still visible */ }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy coupon code ${code}`}
      className={`inline-flex items-center gap-2 border border-dashed border-current px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-widest ${className}`}
    >
      {copied ? 'Copied ✓' : <>Code: {code}</>}
    </button>
  )
}
