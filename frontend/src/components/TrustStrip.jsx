const POINTS = [
  ['Secure payments', 'Razorpay · UPI, cards, netbanking'],
  ['Ships in 3–5 days', 'Tracked, from Calicut, Kerala'],
  ['Heavyweight 240 GSM', 'DTF print built for regular wear'],
  ['Check before print', 'Every design is reviewed first'],
]

export default function TrustStrip() {
  return (
    <section aria-label="Why shop with us" className="border-y border-panel-2">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
        {POINTS.map(([title, copy]) => (
          <div key={title}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-acid">{title}</p>
            <p className="text-xs text-slate mt-1 leading-snug">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
