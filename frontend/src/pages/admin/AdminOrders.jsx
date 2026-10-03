import { useEffect, useState } from 'react'
import client from '../../api/client'
import { formatINR, formatDate } from '../../utils/format'
import Loader from '../../components/Loader'

const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled']

// "2026-10-06" -> "Tue, 06 Oct" (a plain date, no time/timezone shift)
const formatDay = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })

export default function AdminOrders() {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [shipBusy, setShipBusy] = useState(null)
  const [shipMsg, setShipMsg] = useState(null)

  const load = () => {
    client.get('/api/admin/orders').then((res) => setOrders(res.data)).catch(() => setError('Failed to load orders'))
  }

  useEffect(load, [])

  const handleStatusChange = async (order, status) => {
    setUpdating(order.id)
    try {
      const res = await client.patch(`/api/admin/orders/${order.id}/status`, { status })
      setOrders((prev) => prev.map((o) => (o.id === order.id ? res.data : o)))
    } catch {
      alert('Failed to update status.')
    } finally {
      setUpdating(null)
    }
  }

  const downloadInvoice = async (order) => {
    try {
      const res = await client.get(`/api/admin/orders/${order.id}/invoice`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${order.order_number}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert('Failed to download invoice.')
    }
  }

  // Same job the server runs daily; useful right after fixing a failed booking
  const runShipping = async (action) => {
    setShipBusy(action)
    setShipMsg(null)
    try {
      const res = await client.post(`/api/admin/shipping/${action}`)
      setShipMsg(action === 'book-now'
        ? { ok: true, text: `Pickup for ${res.data.pickup_date}: ${res.data.booked} booked${res.data.failed ? `, ${res.data.failed} failed (see order)` : ''}.` }
        : { ok: true, text: `Tracking synced — ${res.data.updated} order(s) updated.` })
      load()
    } catch (err) {
      setShipMsg({ ok: false, text: err.response?.data?.detail || 'Delhivery request failed.' })
      load()
    } finally {
      setShipBusy(null)
    }
  }

  const openLabel = async (order) => {
    try {
      const res = await client.get(`/api/admin/orders/${order.id}/label`)
      window.open(res.data.url, '_blank', 'noopener')
    } catch (err) {
      alert(err.response?.data?.detail || 'Label not available yet.')
    }
  }

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!orders) return <Loader label="Loading orders" />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper">Orders</h1>
        <div className="flex gap-2">
          <button
            onClick={() => runShipping('book-now')}
            disabled={!!shipBusy}
            className="border border-acid text-acid font-mono text-[11px] uppercase tracking-widest px-3 py-2 hover:bg-acid hover:text-ink transition-colors disabled:opacity-50"
          >
            {shipBusy === 'book-now' ? 'Booking…' : 'Book pickups now'}
          </button>
          <button
            onClick={() => runShipping('sync')}
            disabled={!!shipBusy}
            className="border border-panel-2 text-paper font-mono text-[11px] uppercase tracking-widest px-3 py-2 hover:border-acid hover:text-acid transition-colors disabled:opacity-50"
          >
            {shipBusy === 'sync' ? 'Syncing…' : 'Sync tracking'}
          </button>
        </div>
      </div>
      {shipMsg && (
        <div className={`border text-sm font-mono px-4 py-3 mb-6 ${shipMsg.ok ? 'border-acid bg-acid/10 text-acid' : 'border-riot bg-riot/10 text-riot'}`}>
          {shipMsg.text}
        </div>
      )}

      {orders.length === 0 ? (
        <p className="font-mono text-sm text-slate">No orders yet.</p>
      ) : (
        <div className="border border-panel-2 divide-y divide-panel-2">
          {orders.map((order) => (
            <div key={order.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 justify-between">
                <button
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                  className="text-left flex-1 min-w-0"
                >
                  <p className="font-mono text-sm text-paper">#{order.order_number}</p>
                  <p className="font-mono text-[11px] text-slate mt-0.5 truncate">
                    {order.customer_name} · {formatDate(order.created_at)} · {formatINR(order.total)}
                    {order.order_type === 'custom' && ' · custom'}
                  </p>
                  {(order.pickup_date || order.awb) && (
                    <p className="font-mono text-[11px] mt-0.5 truncate">
                      {order.awb
                        ? <span className="text-acid">{order.courier_name || 'Delhivery'} · {order.awb}{order.courier_status ? ` · ${order.courier_status}` : ''}</span>
                        : <span className="text-paper/70">Pickup {formatDay(order.pickup_date)}</span>}
                    </p>
                  )}
                  {order.courier_error && (
                    <p className="font-mono text-[11px] text-riot mt-0.5 break-words">⚠ {order.courier_error}</p>
                  )}
                </button>

                <select
                  value={order.status}
                  disabled={updating === order.id}
                  onChange={(e) => handleStatusChange(order, e.target.value)}
                  className="bg-panel border border-panel-2 px-3 py-2 text-xs font-mono uppercase tracking-widest text-paper focus:border-acid outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {order.awb && (
                  <button
                    onClick={() => openLabel(order)}
                    className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline shrink-0"
                  >
                    Label
                  </button>
                )}

                <button
                  onClick={() => downloadInvoice(order)}
                  className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline shrink-0"
                >
                  Invoice
                </button>
              </div>

              {expanded === order.id && (
                <div className="mt-4 pt-4 border-t border-panel-2 grid sm:grid-cols-2 gap-6">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-2">Items</p>
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between gap-3 text-xs font-mono text-paper/80 py-1">
                        <span className="min-w-0 break-words">{item.product_name} × {item.quantity} ({item.size})</span>
                        <span className="shrink-0">{formatINR(item.unit_price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-2">Shipping to</p>
                    <p className="text-xs text-paper/80 leading-relaxed">
                      {order.shipping_address}<br />
                      {order.city} {order.state} {order.pincode}<br />
                      {order.customer_phone} · {order.customer_email}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
