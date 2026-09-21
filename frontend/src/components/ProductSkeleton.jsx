export default function ProductSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 gap-y-10 sm:gap-y-12" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-[4/5] skeleton" />
          <div className="mt-3 h-4 w-3/4 skeleton" />
          <div className="mt-2 h-3 w-1/3 skeleton" />
        </div>
      ))}
    </div>
  )
}
