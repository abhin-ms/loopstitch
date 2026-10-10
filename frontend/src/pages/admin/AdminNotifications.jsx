import { useEffect, useState } from 'react'
import client from '../../api/client'
import { formatDate } from '../../utils/format'
import Loader from '../../components/Loader'

const STATUS_LABELS = {
  pending: { label: 'Pending', color: 'text-yellow-400' },
  sent: { label: 'Sent', color: 'text-acid' },
  delivered: { label: 'Delivered', color: 'text-blue-400' },
  read: { label: 'Read', color: 'text-purple-400' },
  failed: { label: 'Failed', color: 'text-riot' },
}

const STATUS_FILTERS = ['', 'sent', 'delivered', 'read', 'failed', 'pending']

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState(null)
  const [resending, setResending] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    const params = new URLSearchParams({ page, per_page: 20 })
    if (statusFilter) params.set('status_filter', statusFilter)
    client.get(`/api/admin/notifications?${params}`)
      .then((res) => {
        setNotifications(res.data.items)
        setTotal(res.data.total)
        setSelected(new Set())  // a fresh page / filter starts with nothing ticked
      })
      .catch(() => setError('Failed to load notifications'))
  }

  useEffect(load, [page, statusFilter])

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  // Only removes the log entry here; a message already sent stays on the customer's phone
  const deleteNotifications = async (ids) => {
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length === 1 ? 'this notification' : `${ids.length} notifications`} from the log? This cannot be undone.`)) return
    setDeleting(true)
    try {
      if (ids.length === 1) await client.delete(`/api/admin/notifications/${ids[0]}`)
      else await client.post('/api/admin/notifications/bulk-delete', { ids })
      setSelected(new Set())
      // stepping back a page if this one is now empty
      if (ids.length >= notifications.length && page > 1) setPage((p) => p - 1)
      else load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete.')
    } finally {
      setDeleting(false)
    }
  }

  const handleResend = async (n) => {
    if (!confirm(`Resend WhatsApp message to ${n.customer_name}?`)) return
    setResending(n.id)
    try {
      const res = await client.post(`/api/admin/notifications/${n.id}/resend`)
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? res.data : item)))
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to resend message.')
    } finally {
      setResending(null)
    }
  }

  const totalPages = Math.ceil(total / 20)

  if (error && !notifications) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!notifications) return <Loader label="Loading notifications" />

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">WhatsApp Notifications</h1>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setStatusFilter(f); setPage(1) }}
            className={`font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 min-h-11 border transition-colors ${
              statusFilter === f
                ? 'border-acid bg-acid/10 text-acid'
                : 'border-panel-2 text-slate hover:text-paper'
            }`}
          >
            {f || 'All'}
          </button>
        ))}
      </div>

      {notifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 font-mono text-[11px] uppercase tracking-widest">
          <label className="flex items-center gap-2 text-paper cursor-pointer">
            <input
              type="checkbox"
              className="accent-acid w-4 h-4"
              checked={selected.size === notifications.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(notifications.map((n) => n.id)) : new Set())}
            />
            Select all on this page
          </label>
          {selected.size > 0 && (
            <button
              onClick={() => deleteNotifications([...selected])}
              disabled={deleting}
              className="ml-auto bg-riot text-ink px-3 py-2 hover:bg-acid transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          )}
        </div>
      )}

      {notifications.length === 0 ? (
        <p className="font-mono text-sm text-slate">No notifications{statusFilter ? ` with status "${statusFilter}"` : ''}.</p>
      ) : (
        <div className="border border-panel-2 divide-y divide-panel-2">
          {notifications.map((n) => {
            const statusInfo = STATUS_LABELS[n.status] || STATUS_LABELS.pending
            return (
              <div key={n.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 justify-between">
                  <input
                    type="checkbox"
                    aria-label={`Select notification for order ${n.order_number}`}
                    className="accent-acid w-4 h-4 shrink-0"
                    checked={selected.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-paper">
                      #{n.order_number}
                      <span className={`ml-2 text-[11px] ${statusInfo.color}`}>{statusInfo.label}</span>
                    </p>
                    <p className="font-mono text-[11px] text-slate mt-0.5 truncate">
                      {n.customer_name} · {n.customer_phone} · {formatDate(n.created_at)}
                    </p>
                    {n.error_message && (
                      <p className="font-mono text-[11px] text-riot mt-1 max-w-lg truncate" title={n.error_message}>
                        {n.error_message}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    {n.sent_at && (
                      <span className="font-mono text-[10px] text-slate hidden sm:inline" title={`Sent: ${formatDate(n.sent_at)}`}>
                        Sent {formatDate(n.sent_at)}
                      </span>
                    )}
                    {n.delivered_at && (
                      <span className="font-mono text-[10px] text-slate hidden sm:inline" title={`Delivered: ${formatDate(n.delivered_at)}`}>
                        Delivered {formatDate(n.delivered_at)}
                      </span>
                    )}
                    {n.status === 'failed' && (
                      <button
                        onClick={() => handleResend(n)}
                        disabled={resending === n.id}
                        className="font-mono text-[11px] uppercase tracking-widest text-acid hover:underline disabled:opacity-50 px-2 py-2"
                      >
                        {resending === n.id ? 'Sending…' : 'Resend'}
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotifications([n.id])}
                      disabled={deleting}
                      className="font-mono text-[11px] uppercase tracking-widest text-riot hover:underline disabled:opacity-50 px-2 py-2"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
          <span className="font-mono text-[11px] text-slate">
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 min-h-11 border border-panel-2 text-slate hover:text-paper disabled:opacity-40"
            >
              ← Prev
            </button>
              <span className="font-mono text-[11px] text-slate px-3 py-2.5 min-h-11 flex items-center">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 min-h-11 border border-panel-2 text-slate hover:text-paper disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
