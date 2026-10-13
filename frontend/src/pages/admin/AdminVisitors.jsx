import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'

const PERIODS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'All time' },
]
const REFRESH_MS = 15000

const num = (n) => (n ?? 0).toLocaleString('en-IN')
const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0)

function ago(seconds) {
  return seconds < 10 ? 'just now' : `${seconds}s ago`
}

// A list of labelled bars: one row per device or per source
function Breakdown({ title, rows, empty }) {
  const total = rows.reduce((sum, r) => sum + r.visits, 0)
  return (
    <div className="border border-panel-2 p-4 sm:p-5 min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-4">{title}</p>
      {rows.length === 0 ? (
        <p className="font-mono text-xs text-slate">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-paper truncate">{r.label}</span>
                <span className="font-mono text-xs text-slate shrink-0">{num(r.visits)} · {pct(r.visits, total)}%</span>
              </div>
              <div className="h-1.5 bg-panel-2 mt-1.5">
                <div className="h-full bg-acid" style={{ width: `${pct(r.visits, total)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Anonymous visitor detail: who is online now, and visits by device and by where they came from.
// The Dashboard keeps the simple totals; this page is the breakdown.
export default function AdminVisitors() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = () => client.get('/api/admin/visitors', { params: { days } })
      .then((res) => { if (!cancelled) { setData(res.data); setError(null) } })
      .catch(() => { if (!cancelled) setError('Failed to load visitor details') })
    load()
    const timer = setInterval(load, REFRESH_MS)  // keeps the live count fresh
    return () => { cancelled = true; clearInterval(timer) }
  }, [days])

  if (error && !data) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!data) return <Loader label="Loading visitors" />

  const live = data.live
  return (
    <div>
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">Visitors</h1>

      <div className="border border-acid p-4 sm:p-5 mb-10">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${live.count > 0 ? 'bg-acid animate-pulse' : 'bg-panel-2'}`} />
          <p className="font-mono text-[11px] uppercase tracking-widest text-slate">On the website right now</p>
        </div>
        <p className="font-display text-4xl text-acid mt-2">{num(live.count)}</p>
        {live.visitors.length > 0 && (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-slate">
                  <th className="pb-2 pr-4 font-normal">Device</th>
                  <th className="pb-2 pr-4 font-normal">Came from</th>
                  <th className="pb-2 pr-4 font-normal">Looking at</th>
                  <th className="pb-2 font-normal">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {live.visitors.map((v, i) => (
                  <tr key={i} className="border-t border-panel-2">
                    <td className="py-2 pr-4 text-paper">{v.device}</td>
                    <td className="py-2 pr-4 text-paper">{v.source}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate break-all">{v.path || '/'}</td>
                    <td className="py-2 font-mono text-xs text-slate whitespace-nowrap">{ago(v.seconds_ago)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="font-mono text-[10px] text-slate mt-3">Updates every 15 seconds. Your own visits while logged in as admin are not counted.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setDays(p.days)}
            className={`font-mono text-[11px] uppercase tracking-widest px-4 py-2 border transition-colors ${
              days === p.days ? 'border-acid text-acid' : 'border-panel-2 text-slate hover:text-paper hover:border-paper'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="border border-panel-2 p-3 sm:p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Visitors</p>
          <p className="font-display text-2xl text-paper">{num(data.visits)}</p>
        </div>
        <div className="border border-panel-2 p-3 sm:p-5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate mb-2">Page views</p>
          <p className="font-display text-2xl text-paper">{num(data.page_views)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-3">
        <Breakdown title="Device" rows={data.devices} empty="No visits recorded for this period yet." />
        <Breakdown title="Came from" rows={data.sources} empty="No visits recorded for this period yet." />
      </div>
      <p className="font-mono text-[10px] text-slate leading-relaxed mb-10">
        {data.breakdown_since
          ? `Device and source are recorded from ${new Date(data.breakdown_since).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}; earlier visits are only in the totals. `
          : 'Device and source are recorded from the first visit after this page was added. '}
        “Direct” means the link was typed, bookmarked, or opened from an app that does not say where it came from (WhatsApp usually shows as Direct).
      </p>

      <p className="font-mono text-[11px] uppercase tracking-widest text-slate mb-3">Day by day</p>
      <div className="border border-panel-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-slate">
              <th className="p-3 font-normal">Date</th>
              <th className="p-3 font-normal text-right">Visitors</th>
              <th className="p-3 font-normal text-right">Page views</th>
            </tr>
          </thead>
          <tbody>
            {data.daily.length === 0 && (
              <tr><td colSpan="3" className="p-3 font-mono text-xs text-slate">No visits in this period.</td></tr>
            )}
            {data.daily.map((d) => (
              <tr key={d.day} className="border-t border-panel-2">
                <td className="p-3 text-paper">{new Date(d.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td className="p-3 text-right font-mono text-paper">{num(d.visits)}</td>
                <td className="p-3 text-right font-mono text-slate">{num(d.page_views)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
