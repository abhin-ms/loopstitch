// Branded loading state — a thread being stitched across a dashed line,
// echoing the sewing-cursor trail used elsewhere on the site.
export default function StitchLoader({ label = 'Loading' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '64px 16px' }}>
      <svg width="100" height="14" viewBox="0 0 100 14" fill="none" aria-hidden="true">
        <line className="ls-stitch-line" x1="3" y1="7" x2="97" y2="7" stroke="var(--ls-accent)" strokeWidth="2.25" strokeLinecap="round" strokeDasharray="6 6" />
        <circle className="ls-stitch-bead" cx="3" cy="7" r="3.5" fill="var(--ls-accent)" />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ls-text-muted)' }}>
        {label}
      </span>
    </div>
  )
}
