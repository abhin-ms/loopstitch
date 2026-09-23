import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import SizeGuide from '../components/SizeGuide'
import { SIZE_CHART } from '../utils/sizing'

// Answers follow the policies published on /privacy. Keep them in sync.
function buildFaq(cod) {
  return [
    {
      id: 'sizing', title: 'Fit & sizing', items: [
        ['Are the tees unisex?', 'Yes. Every Loopstitch tee is cut unisex with an oversized, dropped-shoulder fit, made to be worn by anyone.'],
        ['What size should I get?', `Most people wear their usual size for the intended oversized look. If you usually buy women's sizes, go one size down for a relaxed fit. Sizes run ${SIZE_CHART.map((r) => r.size).join(', ')}; use the size guide below to compare measurements.`],
        ['Will it shrink?', 'Wash cold and inside out, and dry in the shade, to keep the fit and the print at their best.'],
      ],
    },
    {
      id: 'orders', title: 'Orders & payment', items: [
        ['How can I pay?', cod?.cod_enabled
          ? `Online by UPI, card or netbanking through Razorpay. Cash on delivery is also available: you pay ${cod.cod_advance_percent}% online to confirm the order and the rest on delivery.`
          : 'Online by UPI, card or netbanking through Razorpay.'],
        ['How do I track my order?', 'Log in with your phone number (top right of the site) and open My Orders to see every order and its status.'],
        ['Can I cancel my order?', 'Cancellation requests are considered within 10 days of placing the order, but not once the order has been shipped or is out for delivery. In that case you can refuse it at the doorstep.'],
      ],
    },
    {
      id: 'shipping', title: 'Shipping', items: [
        ['When will my order ship?', 'Orders are dispatched within 3 days of the order or payment, through registered domestic couriers or speed post.'],
        ['Is shipping free?', 'Orders above the free-shipping amount shown in your cart ship free. Below that, a small delivery fee is added at checkout.'],
      ],
    },
    {
      id: 'returns', title: 'Returns & exchanges', items: [
        ['Can I return or exchange a tee?', 'Yes, within 10 days of purchase, as long as it is unused, in the condition you received it and in its original packaging. Items bought on sale may not be eligible.'],
        ['What if my order arrives damaged or wrong?', 'Report it to us within 10 days of receiving it and we will check it and arrange a replacement or refund.'],
        ['How long do refunds take?', 'Approved refunds are processed within 14 days.'],
      ],
    },
    {
      id: 'custom', title: 'Custom prints', items: [
        ['Can I print my own design?', 'Yes. Open the custom studio, upload your artwork, logo or photo, place it on the tee and order. Every design is checked before it is printed.'],
        ['Is there a minimum quantity?', 'Custom orders have a minimum quantity set by our team; the custom studio shows it along with bulk discounts.'],
      ],
    },
  ]
}

export default function Faq() {
  const [cod, setCod] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const faq = useMemo(() => buildFaq(cod), [cod])

  useEffect(() => {
    document.title = 'FAQ & size help | Loopstitch Co.'
    client.get('/api/settings/checkout').then((res) => setCod(res.data)).catch(() => {})
    return () => { document.title = 'Loopstitch Co.' }
  }, [])

  // FAQPage markup so Google can show these answers directly in results
  useEffect(() => {
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.flatMap((g) => g.items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))),
    })
    document.head.appendChild(el)
    return () => el.remove()
  }, [faq])

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
      <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">Help</p>
      <h1 className="font-display text-4xl sm:text-5xl uppercase text-paper mb-4">FAQ &amp; size help</h1>
      <nav aria-label="FAQ sections" className="flex flex-wrap gap-2 mb-12">
        {faq.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate hover:text-acid hover:border-acid">{g.title}</a>
        ))}
      </nav>

      {faq.map((group) => (
        <section key={group.id} id={group.id} className="scroll-mt-24 mb-12" aria-labelledby={`${group.id}-h`}>
          <h2 id={`${group.id}-h`} className="font-display text-2xl sm:text-3xl uppercase text-paper mb-4">{group.title}</h2>
          {group.id === 'sizing' && (
            <button type="button" onClick={() => setGuideOpen(true)} className="mb-4 bg-acid text-ink font-mono text-xs uppercase tracking-widest px-5 py-3 hover:bg-riot transition-colors">
              Open size guide &amp; fit finder
            </button>
          )}
          <div className="border-t border-panel-2">
            {group.items.map(([q, a]) => (
              <details key={q} className="group border-b border-panel-2">
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none text-paper font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-slate transition-transform group-open:rotate-45 text-xl leading-none shrink-0" aria-hidden="true">+</span>
                </summary>
                <p className="pb-5 text-sm text-paper/70 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <div className="border border-panel-2 p-6">
        <h2 className="font-display text-2xl uppercase text-paper mb-2">Still need help?</h2>
        <p className="text-sm text-slate mb-4">Email us and we&apos;ll get back to you. Full details are in our <Link to="/privacy#refunds" className="underline underline-offset-4 hover:text-acid">refund</Link>, <Link to="/privacy#returns" className="underline underline-offset-4 hover:text-acid">return</Link> and <Link to="/privacy#shipping" className="underline underline-offset-4 hover:text-acid">shipping</Link> policies.</p>
        <a href="mailto:hello@loopstitch.online" className="inline-block bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors">hello@loopstitch.online</a>
      </div>

      <SizeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
