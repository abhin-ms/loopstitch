import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client, { mediaUrl } from '../../api/client'
import Loader from '../../components/Loader'
import { formatINR } from '../../utils/format'

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'In cart' },
  { key: 'cleared', label: 'Cleared' },
  { key: 'ordered', label: 'Ordered' },
]
const PERIODS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'All (90 days kept)' },
]
const BADGE = {
  active: 'border-acid text-acid',
  cleared: 'border-riot text-riot',
  ordered: 'border-paper text-paper',
}
const STATUS_LABEL = { active: 'In cart', cleared: 'Cleared', ordered: 'Ordered' }

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Admin → Carts: what shoppers added to their cart, and whether they emptied it or ordered.
export default function AdminCarts() {
  const [status, setStatus] = useState('')
  const [days, setDays] = useState(7)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    setData(null)
    client.get('/api/admin/carts', { params: { status, days } })
      .then((res) => { setData(res.data); setError(null) })
      .catch(() => setError('Failed to load carts'))
  }, [status, days])

  const counts = data?.counts || { active: 0, cleared: 0, ordered: 0 }
  const total = counts.active + counts.cleared + counts.ordered
  const summary = [
    { label: 'Carts started', value: total, accent: true },
    { label: 'Still in cart', value: counts.active },
    { label: 'Cleared', value: counts.cleared },
    { label: 'Ordered', value: counts.ordered },
  ]

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">Carts</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" onClick={() => setDays(p.days)}
            className={`font-mono text-[11px] uppercase tracking-widest px-4 py-2 border transition-colors ${days === p.days ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper hover:border-paper'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summary.map((c) => (
          <div key={c.label} className="border border-panel-2 p-3 sm:p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">{c.label}</p>
            <p className={`font-display text-2xl ${c.accent ? 'text-acid' : 'text-paper'}`}>{c.value.toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setStatus(f.key)}
            className={`font-mono text-[11px] uppercase tracking-widest px-4 py-2 border transition-colors ${status === f.key ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper hover:border-paper'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-riot font-mono text-sm mb-4">{error}</p>}
      {!data && !error && <Loader label="Loading carts" />}
      {data && (
        <div className="border border-panel-2 overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="p-3 font-normal">Last change</th>
                <th className="p-3 font-normal">IP address</th>
                <th className="p-3 font-normal">Shopper</th>
                <th className="p-3 font-normal text-right">Items</th>
                <th className="p-3 font-normal text-right">Value</th>
                <th className="p-3 font-normal">Status</th>
                <th className="p-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {data.carts.length === 0 && (
                <tr><td colSpan="7" className="p-3 font-mono text-xs text-slate">No carts in this period.</td></tr>
              )}
              {data.carts.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-t border-panel-2 align-top">
                    <td className="p-3 text-paper whitespace-nowrap">{when(c.updated_at)}</td>
                    <td className="p-3 font-mono text-xs text-paper">{c.ip || '—'}</td>
                    <td className="p-3">
                      <p className="text-paper">{c.customer_name || c.customer_phone || 'Guest'}</p>
                      <p className="font-mono text-[10px] text-slate mt-0.5">{[c.customer_name && c.customer_phone, c.device, c.source].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td className="p-3 text-right font-mono text-paper">
                      {c.status === 'active' ? c.item_count : c.peak_count}
                    </td>
                    <td className="p-3 text-right font-mono text-paper">{c.status === 'active' ? formatINR(c.value) : '—'}</td>
                    <td className="p-3">
                      <span className={`inline-block border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${BADGE[c.status] || ''}`}>
                        {STATUS_LABEL[c.status] || c.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)}
                        className="font-mono text-[11px] uppercase tracking-widest text-acid hover:text-paper">
                        {open === c.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {open === c.id && (
                    <tr className="bg-panel">
                      <td colSpan="7" className="p-3">
                        {c.items.length === 0 ? (
                          <p className="font-mono text-xs text-slate">
                            {c.status === 'cleared' ? `The shopper removed everything (it held ${c.peak_count} item${c.peak_count === 1 ? '' : 's'}).` : 'The cart was emptied when the order was placed.'}
                          </p>
                        ) : (
                          <>
                            {c.status !== 'active' && (
                              <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Last items in the cart before it was {c.status}</p>
                            )}
                            <ul className="space-y-2">
                              {c.items.map((i, n) => (
                                <li key={n} className="flex items-center gap-3">
                                  {i.image ? <img src={mediaUrl(i.image)} alt="" className="w-10 h-12 object-cover bg-panel-2 shrink-0" /> : <div className="w-10 h-12 bg-panel-2 shrink-0" />}
                                  <div className="min-w-0 flex-1">
                                    {i.slug ? <Link to={`/product/${i.slug}`} target="_blank" className="text-paper hover:text-acid">{i.name}</Link> : <span className="text-paper">{i.name}</span>}
                                    <p className="font-mono text-[11px] text-slate">{[i.color, i.size && `Size ${i.size}`, `Qty ${i.quantity}`].filter(Boolean).join(' · ')}</p>
                                  </div>
                                  <span className="font-mono text-xs text-paper">{formatINR(i.price * i.quantity)}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        <p className="font-mono text-[10px] text-slate mt-3">First item added {when(c.created_at)}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-mono text-[10px] text-slate mt-3 leading-relaxed">
        One row per cart, from the first item until it is emptied (“Cleared”) or turned into an order (“Ordered”).
        Shoppers who leave with items still in the cart stay “In cart”. Your own testing while logged in as admin is not recorded. Kept for 90 days.
      </p>
    </div>
  )
}
