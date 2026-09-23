import { Link } from 'react-router-dom'

// Collapsible info under the add-to-cart button. Wording follows the policies on /privacy.
const SECTIONS = [
  {
    title: 'Fit & sizing',
    body: (open) => (
      <>
        <p>Unisex, oversized cut with dropped shoulders. Made to be worn by anyone.</p>
        <p>Most people wear their usual size for the intended look. If you usually buy women&apos;s sizes, go one size down for a relaxed fit.</p>
        <button type="button" onClick={open} className="underline underline-offset-4 hover:text-acid">Open the size guide and fit finder</button>
      </>
    ),
  },
  {
    title: 'Fabric & care',
    body: () => (
      <>
        <p>Premium 250 GSM cotton fabric with a quality print.</p>
        <p>Wash cold, inside out. Don&apos;t iron directly on the print, don&apos;t bleach, and dry in the shade.</p>
      </>
    ),
  },
  {
    title: 'Shipping & returns',
    body: () => (
      <>
        <p>Dispatched within 3 days of your order, by registered courier, with tracking.</p>
        <p>Damaged, defective or wrong item? Tell us within 10 days of delivery and we replace it, with free return shipping. We can&apos;t exchange for size or fit, so please check the size guide first.</p>
        <p>
          <Link to="/privacy#shipping" className="underline underline-offset-4 hover:text-acid">Shipping policy</Link>
          {' · '}
          <Link to="/privacy#returns" className="underline underline-offset-4 hover:text-acid">Return policy</Link>
        </p>
      </>
    ),
  },
]

export default function ProductDetails({ onOpenSizeGuide }) {
  return (
    <div className="mt-10 border-t border-panel-2">
      {SECTIONS.map((s, i) => (
        <details key={s.title} open={i === 0} className="group border-b border-panel-2">
          <summary className="flex items-center justify-between py-4 cursor-pointer list-none font-mono text-xs uppercase tracking-widest text-paper [&::-webkit-details-marker]:hidden">
            {s.title}
            <span className="text-slate transition-transform group-open:rotate-45 text-lg leading-none" aria-hidden="true">+</span>
          </summary>
          <div className="pb-5 text-sm text-paper/70 leading-relaxed space-y-2">{s.body(onOpenSizeGuide)}</div>
        </details>
      ))}
      <p className="font-mono text-[11px] text-slate pt-4">Limited batch — once a size sells out it is retired, not restocked.</p>
    </div>
  )
}
