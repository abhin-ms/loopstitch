import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const TABS = [
  { key: 'logins', label: 'Login activity' },
  { key: 'customers', label: 'Customer accounts' },
]

// Admin → Accounts: every login (customers by WhatsApp OTP, and admins), and the list of customer accounts.
export default function AdminAccounts() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('logins')
  const [failedOnly, setFailedOnly] = useState(false)

  useEffect(() => {
    client.get('/api/admin/accounts')
      .then((res) => setData(res.data))
      .catch(() => setError('Failed to load accounts'))
  }, [])

  if (error) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!data) return <Loader label="Loading accounts" />

  const dayAgo = Date.now() - 24 * 3600 * 1000
  const today = data.logins.filter((l) => new Date(l.at).getTime() >= dayAgo)
  const summary = [
    { label: 'Customer accounts', value: data.customers.length, accent: true },
    { label: 'Logins · 24 h', value: today.filter((l) => l.ok).length },
    { label: 'Failed attempts · 24 h', value: today.filter((l) => !l.ok).length, danger: today.some((l) => !l.ok) },
  ]
  const logins = failedOnly ? data.logins.filter((l) => !l.ok) : data.logins

  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">Accounts</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {summary.map((c) => (
          <div key={c.label} className="border border-panel-2 p-3 sm:p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">{c.label}</p>
            <p className={`font-display text-2xl ${c.accent ? 'text-acid' : c.danger ? 'text-riot' : 'text-paper'}`}>{c.value.toLocaleString('en-IN')}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`font-mono text-[11px] uppercase tracking-widest px-4 py-2 border transition-colors ${tab === t.key ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper hover:border-paper'}`}>
            {t.label}
          </button>
        ))}
        {tab === 'logins' && (
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-slate ml-auto">
            <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
            Failed only
          </label>
        )}
      </div>

      {tab === 'logins' ? (
        <div className="border border-panel-2 overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="p-3 font-normal">When</th>
                <th className="p-3 font-normal">Who</th>
                <th className="p-3 font-normal">Type</th>
                <th className="p-3 font-normal">Result</th>
                <th className="p-3 font-normal">IP address</th>
                <th className="p-3 font-normal">Device</th>
              </tr>
            </thead>
            <tbody>
              {logins.length === 0 && <tr><td colSpan="6" className="p-3 font-mono text-xs text-slate">No logins recorded yet.</td></tr>}
              {logins.map((l) => (
                <tr key={l.id} className="border-t border-panel-2">
                  <td className="p-3 text-paper whitespace-nowrap">{when(l.at)}</td>
                  <td className="p-3">
                    <p className="text-paper">{l.name || l.who}</p>
                    {l.name && <p className="font-mono text-[10px] text-slate">{l.who}</p>}
                  </td>
                  <td className="p-3 font-mono text-xs text-slate uppercase">{l.kind}</td>
                  <td className={`p-3 font-mono text-xs ${l.ok ? 'text-acid' : 'text-riot'}`}>{l.ok ? '✓ ' : '✕ '}{l.detail}</td>
                  <td className="p-3 font-mono text-xs text-paper">{l.ip || '—'}</td>
                  <td className="p-3 text-slate">{l.device || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border border-panel-2 overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                <th className="p-3 font-normal">Name</th>
                <th className="p-3 font-normal">Phone</th>
                <th className="p-3 font-normal">Email</th>
                <th className="p-3 font-normal text-right">Orders</th>
                <th className="p-3 font-normal">Joined</th>
                <th className="p-3 font-normal">Last login</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.length === 0 && <tr><td colSpan="6" className="p-3 font-mono text-xs text-slate">No customer accounts yet.</td></tr>}
              {data.customers.map((c) => (
                <tr key={c.id} className="border-t border-panel-2">
                  <td className="p-3 text-paper">{c.name || '—'}</td>
                  <td className="p-3 font-mono text-xs text-paper">{c.phone}</td>
                  <td className="p-3 text-slate break-all">{c.email || '—'}</td>
                  <td className="p-3 text-right font-mono text-paper">{c.orders}</td>
                  <td className="p-3 text-slate whitespace-nowrap">{when(c.joined)}</td>
                  <td className="p-3 text-slate whitespace-nowrap">{when(c.last_login)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="font-mono text-[10px] text-slate mt-3 leading-relaxed">
        Customers log in with a WhatsApp code; accounts are also created automatically on a first order. Login history is kept for 90 days.
      </p>
    </div>
  )
}
