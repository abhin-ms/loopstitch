import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'

export default function AdminSubscribers() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    client.get('/api/admin/subscribers').then((res) => setRows(res.data)).catch(() => setError('Failed to load subscribers'))
  }, [])

  const exportCsv = () => {
    const csv = ['contact,type,source,signed_up', ...rows.map((r) => `${r.contact},${r.kind},${r.source},${r.created_at}`)].join('\n')
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
      {rows.length === 0 ? (
        <p className="font-mono text-sm text-slate">No sign-ups yet.</p>
      ) : (
        <div className="border border-panel-2 divide-y divide-panel-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-panel">
              <span className="font-mono text-sm text-paper">{r.contact}</span>
              <span className="font-mono text-[11px] text-slate uppercase tracking-wider">{r.kind} · {r.source} · {new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
