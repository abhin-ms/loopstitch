import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../../api/client'
import { formatINR } from '../../utils/format'
import Loader from '../../components/Loader'

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState(null)
  const [error, setError] = useState(null)

  const load = () => {
    client.get('/api/admin/coupons').then((res) => setCoupons(res.data)).catch(() => setError('Failed to load coupons'))
  }

  useEffect(load, [])

  const handleToggle = async (coupon) => {
    try {
      await client.patch(`/api/admin/coupons/${coupon.id}/toggle`)
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)))
    } catch {
      alert('Failed to update coupon.')
    }
  }

  const handleDelete = async (coupon) => {
    if (!confirm(`Delete coupon "${coupon.code}"? This can't be undone.`)) return
    try {
      await client.delete(`/api/admin/coupons/${coupon.id}`)
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id))
    } catch {
      alert('Failed to delete coupon.')
    }
  }

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!coupons) return <Loader label="Loading coupons" />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper">Coupons</h1>
        <Link to="/admin/coupons/new" className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-acid transition-colors shrink-0">
          + New coupon
        </Link>
      </div>

      <p className="font-mono text-[11px] text-slate mb-6">
        Percentage discount codes customers enter at checkout. Stacks on top of any BOGO offer.
      </p>

      {coupons.length === 0 ? (
        <p className="font-mono text-sm text-slate">No coupons yet. Create your first discount code.</p>
      ) : (
        <div className="border border-panel-2 divide-y divide-panel-2">
          {coupons.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="text-paper text-sm truncate font-mono">
                  {c.code}
                  {!c.is_active && <span className="ml-2 text-[10px] text-slate">(paused)</span>}
                </p>
                <p className="font-mono text-[11px] text-slate mt-0.5 truncate">
                  {c.label || `${c.discount_percent}% off`}
                  {c.max_uses > 0 ? ` · ${c.times_used}/${c.max_uses} used` : ` · ${c.times_used} used`}
                  {c.min_order > 0 && ` · min ${formatINR(c.min_order)}`}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleToggle(c)}
                    className={`font-mono text-[10px] uppercase tracking-widest px-3 py-2.5 min-h-11 border transition-colors ${
                    c.is_active ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper'
                  }`}
                >
                  {c.is_active ? 'Active' : 'Paused'}
                </button>
                <Link to={`/admin/coupons/${c.id}`} className="font-mono text-xs uppercase tracking-widest text-acid hover:underline px-2 py-2">
                  Edit
                </Link>
                <button onClick={() => handleDelete(c)} className="font-mono text-xs uppercase tracking-widest text-riot hover:underline px-2 py-2">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
