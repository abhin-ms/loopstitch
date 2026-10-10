import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'
import { formatDate } from '../../utils/format'

function StatusBadge({ row }) {
  if (row.unsubscribed) return <span className="text-slate">Unsubscribed</span>
  if (row.notified_at) return <span className="text-acid">✓ Reminder sent {formatDate(row.notified_at)}</span>
  if (row.notify_error) return <span className="text-riot" title={row.notify_error}>Failed</span>
  if (row.welcomed_at) return <span className="text-paper/70">✓ Welcomed · reminder at launch</span>
  return <span className="text-paper/60">Waiting</span>
}

export default function AdminSubscribers() {
  const [rows, setRows] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [error, setError] = useState(null)
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = () => {
    client.get('/api/admin/subscribers').then((res) => setRows(res.data)).catch(() => setError('Failed to load subscribers'))
    client.get('/api/admin/launch-alerts').then((res) => setAlerts(res.data)).catch(() => {})
  }

  useEffect(load, [])

  const sendTest = async (kind) => {
    if (!testTo.trim()) return setMsg({ ok: false, text: 'Enter your email or WhatsApp number first.' })
    setBusy(kind)
    setMsg(null)
    try {
      const res = await client.post('/api/admin/launch-alerts/test', { contact: testTo, kind })
      setMsg({ ok: true, text: res.data.detail })
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Test failed.' })
    } finally {
      setBusy(null)
    }
  }

  const sendNow = async () => {
    const pending = alerts.total - alerts.sent
    if (!window.confirm(`Send the "1 minute to go" launch reminder now to ${pending} subscriber${pending === 1 ? '' : 's'} who haven't had it yet?`)) return
    setBusy('send')
    setMsg(null)
    try {
      const res = await client.post('/api/admin/launch-alerts/send-now')
      setMsg({ ok: res.data.failed === 0, text: `Sent ${res.data.sent}${res.data.failed ? ` · ${res.data.failed} failed (see list)` : ''}.` })
      load()
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.detail || 'Sending failed.' })
    } finally {
      setBusy(null)
    }
  }

  const exportCsv = () => {
    const csv = ['contact,type,source,signed_up,notified', ...rows.map((r) => `${r.contact},${r.kind},${r.source},${r.created_at},${r.notified_at || ''}`)].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'loopstitch-subscribers.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!rows) return <Loader label="Loading subscribers" />

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper">Subscribers <span className="font-mono text-sm text-slate">({rows.length})</span></h1>
        {rows.length > 0 && (
          <button onClick={exportCsv} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-5 py-2.5 hover:bg-acid transition-colors">
            Export CSV
          </button>
        )}
      </div>

      {alerts && (
        <div className="border border-panel-2 p-5 sm:p-6 mb-8 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Subscriber messages</h2>
            <p className="font-mono text-[11px] text-slate">
              {alerts.email} email · {alerts.whatsapp} WhatsApp · {alerts.welcomed} welcomed · <span className="text-acid">{alerts.sent} reminded</span>
              {alerts.failed > 0 && <span className="text-riot"> · {alerts.failed} failed</span>}
              {alerts.unsubscribed > 0 && ` · ${alerts.unsubscribed} unsubscribed`}
            </p>
          </div>
          <p className="font-mono text-[11px] text-slate">
            1) "You're on the list" right after someone subscribes · 2) "1 minute to go" one minute before launch
            {alerts.launch_label ? ` (${alerts.launch_label})` : ' (set the launch time in Settings)'}.
            Turn on in Settings → Launching soon page. Email comes from info@loopstitch.online; WhatsApp uses the subscribe_confirm and store_launch templates.
          </p>
          {(!alerts.email_configured || !alerts.whatsapp_configured) && (
            <div className="border border-riot bg-riot/10 text-riot font-mono text-[11px] px-3 py-2 space-y-1">
              {!alerts.email_configured && <p>Email is not set up yet (SMTP_HOST / SMTP_USER / SMTP_PASSWORD on the server) — email subscribers can't be sent to.</p>}
              {!alerts.whatsapp_configured && <p>WhatsApp is not set up on the server — WhatsApp subscribers can't be sent to.</p>}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); sendTest('reminder') }} className="flex flex-col sm:flex-row flex-wrap gap-2">
            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              required
              placeholder="Your email or WhatsApp number"
              className="flex-1 bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono"
            />
            <button type="button" onClick={() => sendTest('welcome')} disabled={!!busy} className="border border-acid text-acid font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 hover:bg-acid hover:text-ink transition-colors disabled:opacity-50">
              {busy === 'welcome' ? 'Sending…' : 'Test sign-up msg'}
            </button>
            <button type="submit" disabled={!!busy} className="border border-acid text-acid font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 hover:bg-acid hover:text-ink transition-colors disabled:opacity-50">
              {busy === 'reminder' ? 'Sending…' : 'Test launch reminder'}
            </button>
            <button type="button" onClick={sendNow} disabled={!!busy || alerts.total === alerts.sent} className="bg-riot text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 hover:bg-acid transition-colors disabled:opacity-50">
              {busy === 'send' ? 'Sending…' : 'Send reminder to all now'}
            </button>
          </form>
          {msg && (
            <p className={`font-mono text-[11px] ${msg.ok ? 'text-acid' : 'text-riot'}`}>{msg.text}</p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-sm text-slate">No sign-ups yet.</p>
      ) : (
        <div className="border border-panel-2 divide-y divide-panel-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-panel">
              <div className="min-w-0">
                <span className="font-mono text-sm text-paper">{r.contact}</span>
                {r.notify_error && !r.notified_at && (
                  <p className="font-mono text-[11px] text-riot mt-0.5 break-words">{r.notify_error}</p>
                )}
              </div>
              <span className="font-mono text-[11px] uppercase tracking-wider text-right">
                <span className="text-slate">{r.kind} · {r.source} · {new Date(r.created_at).toLocaleDateString()} · </span>
                <StatusBadge row={r} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
