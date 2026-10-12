import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client from '../../api/client'
import { formatINR } from '../../utils/format'
import Loader from '../../components/Loader'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    client.get('/api/admin/stats')
      .then((res) => setStats(res.data))
      .catch((err) => { console.error('Failed to load stats:', err); setError('Failed to load dashboard stats') })
  }, [])

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!stats) return <Loader label="Loading stats" />

  const cards = [
    { label: 'Revenue', value: formatINR(stats.revenue), accent: true },
    { label: 'Orders (paid)', value: stats.total_orders },
    { label: 'Unpaid checkouts', value: stats.unpaid_checkouts ?? 0, hint: 'Reached payment but did not pay — not sales' },
    { label: 'Products', value: stats.total_products },
    { label: 'Low stock sizes', value: stats.low_stock_sizes, warn: stats.low_stock_sizes > 0 },
    { label: 'Sold-out sizes', value: stats.out_of_stock_sizes, danger: stats.out_of_stock_sizes > 0 },
  ]

  // anonymous visit counter (no personal data) — see /api/track
  const visits = [
    { label: 'Visitors today', value: stats.visitors_today, accent: true },
    { label: 'Visitors · 7 days', value: stats.visitors_7d },
    { label: 'Visitors · all time', value: stats.visitors_total },
    { label: 'Page views today', value: stats.page_views_today },
    { label: 'Page views · all time', value: stats.page_views_total },
  ]

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">Dashboard</h1>
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-3">Website visits</p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
        {visits.map((c) => (
          <div key={c.label} className="border border-panel-2 p-3 sm:p-5 min-w-0 overflow-hidden">
            <p className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-widest text-slate mb-2 break-words">{c.label}</p>
            <p className={`font-display text-lg sm:text-2xl truncate ${c.accent ? 'text-acid' : 'text-paper'}`}>
              {(c.value ?? 0).toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-3">Store</p>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-10">
        {cards.map((c) => (
          <div key={c.label} className="border border-panel-2 p-3 sm:p-5 min-w-0 overflow-hidden">
            <p className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-widest text-slate mb-2 break-words">{c.label}</p>
            <p className={`font-display text-lg sm:text-2xl truncate ${c.accent ? 'text-acid' : c.danger ? 'text-riot' : c.warn ? 'text-acid' : 'text-paper'}`} title={String(c.value)}>
              {c.value}
            </p>
            {c.hint && <p className="font-mono text-[9px] text-slate mt-1.5 leading-snug">{c.hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <Link to="/admin/products/new" className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors">
          + Add product
        </Link>
        <Link to="/admin/orders" className="border border-panel-2 text-paper font-mono text-xs uppercase tracking-widest px-6 py-3 hover:border-paper transition-colors">
          View orders
        </Link>
      </div>
    </div>
  )
}
