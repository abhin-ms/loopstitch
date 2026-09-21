export default function StarRating({ value = 0, size = 14 }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={n <= Math.round(value) ? 'var(--color-acid)' : 'none'} stroke="var(--color-acid)" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 2.5 2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5 6.1 20.7l1.2-6.6L2.5 9.5l6.6-.9z" />
        </svg>
      ))}
    </span>
  )
}
