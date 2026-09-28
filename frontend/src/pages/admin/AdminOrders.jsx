import { useEffect, useState } from 'react'
import client from '../../api/client'
import { formatINR, formatDate } from '../../utils/format'
import Loader from '../../components/Loader'

const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled']

// "2026-10-01" -> "Thu, 01 Oct" (pickup dates are plain dates, no timezone shift)
const formatDay = (d) => {
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
}

const errorText = (err, fallback) => err?.response?.data?.detail || fallback

function ShipmentLine({ order }) {
  const s = order.shipment_status
  if (s === 'created') {
    return (
      <p className="font-mono text-[11px] text-acid mt-1">
        AWB {order.delhivery_awb} · Pickup {formatDay(order.pickup_date)}
      </p>
    )
  }
  if (s === 'creating') return <p className="font-mono text-[11px] text-slate mt-1">Creating Delhivery shipment…</p>
  if (s === 'failed') return <p className="font-mono text-[11px] text-riot mt-1 break-words">Shipment failed: {order.shipment_error}</p>
  if (s === 'cancelled') return <p className="font-mono text-[11px] text-slate mt-1">Shipment cancelled · AWB {order.delhivery_awb}</p>
  return null
}

function PickupPanel({ pickups, onRetry, busy }) {
  if (!pickups || pickups.length === 0) return null
  return (
    <div className="border border-panel-2 p-4 mb-8">
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-3">Delhivery pickups</p>
      <div className="divide-y divide-panel-2">
        {pickups.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-mono text-sm text-paper">
                {formatDay(p.pickup_date)} · {p.pickup_time?.slice(0, 5)} · {p.expected_count} parcel{p.expected_count === 1 ? '' : 's'}
              </p>
              {p.status === 'failed' && (
                <p className="font-mono text-[11px] text-riot break-words mt-0.5">{p.error} (auto-retries every 3h)</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`font-mono text-[11px] uppercase tracking-widest ${p.status === 'scheduled' ? 'text-acid' : p.status === 'failed' ? 'text-riot' : 'text-slate'}`}>
                {p.status}
              </span>
              {p.status !== 'scheduled' && (
                <button
                  onClick={() => onRetry(p)}
                  disabled={busy === `pickup-${p.id}`}
                  className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline disabled:opacity-50"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminOrders() {
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [delhivery, setDelhivery] = useState(null)
  const [pickups, setPickups] = useState([])
  const [busy, setBusy] = useState(null)

  const loadPickups = () => {
    client.get('/api/admin/delhivery/pickups').then((res) => setPickups(res.data)).catch(() => {})
  }

  const load = () => {
    client.get('/api/admin/orders').then((res) => setOrders(res.data)).catch(() => setError('Failed to load orders'))
    client.get('/api/admin/delhivery/status').then((res) => {
      setDelhivery(res.data)
      if (res.data.configured) loadPickups()
    }).catch(() => {})
  }

  useEffect(load, [])

  const replaceOrder = (updated) => setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))

  const handleStatusChange = async (order, status) => {
    if (status === 'cancelled' && order.shipment_status === 'created' &&
        !window.confirm('This will also cancel the Delhivery shipment. Continue?')) return
    setUpdating(order.id)
    try {
      const res = await client.patch(`/api/admin/orders/${order.id}/status`, { status })
      replaceOrder(res.data)
      if (status === 'cancelled') setTimeout(load, 2500) // shipment cancel runs in the background
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

  const shipOrder = async (order) => {
    setBusy(`ship-${order.id}`)
    try {
      const res = await client.post(`/api/admin/orders/${order.id}/delhivery/ship`)
      replaceOrder(res.data)
      loadPickups()
    } catch (err) {
      alert(errorText(err, 'Failed to create shipment.'))
      load()
    } finally {
      setBusy(null)
    }
  }

  const cancelShipment = async (order) => {
    if (!window.confirm(`Cancel Delhivery shipment ${order.delhivery_awb}?`)) return
    setBusy(`cancel-${order.id}`)
    try {
      const res = await client.post(`/api/admin/orders/${order.id}/delhivery/cancel`)
      replaceOrder(res.data)
      loadPickups()
    } catch (err) {
      alert(errorText(err, 'Failed to cancel shipment.'))
    } finally {
      setBusy(null)
    }
  }

  const openLabel = async (order) => {
    setBusy(`label-${order.id}`)
    // open the tab synchronously so popup blockers allow it, then point it at the PDF
    const tab = window.open('', '_blank')
    try {
      const res = await client.get(`/api/admin/orders/${order.id}/delhivery/label`)
      if (tab) tab.location.href = res.data.url
      else window.location.href = res.data.url
    } catch (err) {
      if (tab) tab.close()
      alert(errorText(err, 'Failed to get label.'))
    } finally {
      setBusy(null)
    }
  }

  const retryPickup = async (pickup) => {
    setBusy(`pickup-${pickup.id}`)
    try {
      await client.post(`/api/admin/delhivery/pickups/${pickup.id}/retry`)
    } catch (err) {
      alert(errorText(err, 'Retry failed.'))
    } finally {
      loadPickups()
      setBusy(null)
    }
  }

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!orders) return <Loader label="Loading orders" />

  const canShip = (o) => delhivery?.configured && ['paid', 'shipped'].includes(o.status) &&
    (!o.shipment_status || ['failed', 'cancelled'].includes(o.shipment_status))

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-2">Orders</h1>
      {delhivery && (
        <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-8">
          {delhivery.configured
            ? `Delhivery ${delhivery.mode} · ${delhivery.auto ? `auto pickup order date + ${delhivery.pickup_after_days} days` : 'manual shipping'} · ${delhivery.pickup_location}`
            : 'Delhivery not connected — set DELHIVERY_TOKEN and DELHIVERY_PICKUP_LOCATION'}
        </p>
      )}

      <PickupPanel pickups={pickups} onRetry={retryPickup} busy={busy} />

      {orders.length === 0 ? (
        <p className="font-mono text-sm text-slate">No orders yet.</p>
      ) : (
        <div className="border border-panel-2 divide-y divide-panel-2">
          {orders.map((order) => (
            <div key={order.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 justify-between">
                <button
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                  className="text-left flex-1 min-w-0 basis-full sm:basis-auto"
                >
                  <p className="font-mono text-sm text-paper">#{order.order_number}</p>
                  <p className="font-mono text-[11px] text-slate mt-0.5 truncate">
                    {order.customer_name} · {formatDate(order.created_at)} · {formatINR(order.total)}
                  </p>
                  <ShipmentLine order={order} />
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

                <div className="flex items-center gap-4 shrink-0">
                  {order.shipment_status === 'created' && (
                    <button
                      onClick={() => openLabel(order)}
                      disabled={busy === `label-${order.id}`}
                      className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline disabled:opacity-50"
                    >
                      Label
                    </button>
                  )}
                  {canShip(order) && (
                    <button
                      onClick={() => shipOrder(order)}
                      disabled={busy === `ship-${order.id}`}
                      className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline disabled:opacity-50"
                    >
                      {busy === `ship-${order.id}` ? 'Shipping…' : order.shipment_status ? 'Retry ship' : 'Ship'}
                    </button>
                  )}
                  <button
                    onClick={() => downloadInvoice(order)}
                    className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline"
                  >
                    Invoice
                  </button>
                </div>
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
                    {order.shipment_status === 'created' && (
                      <button
                        onClick={() => cancelShipment(order)}
                        disabled={busy === `cancel-${order.id}`}
                        className="mt-3 font-mono text-[11px] uppercase tracking-widest text-riot hover:underline disabled:opacity-50"
                      >
                        Cancel Delhivery shipment
                      </button>
                    )}
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
