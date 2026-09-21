import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'
import { STYLES } from '../../components/AnnouncementBar'

const EMPTY = { message: '', detail: '', coupon_code: '', link_url: '', link_label: '', style: 'acid', placement: 'both', is_active: true, starts_at: '', ends_at: '' }

// datetime-local wants local time without a zone; the API stores UTC
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const PLACEMENTS = [
  ['bar', 'Top bar only'],
  ['banner', 'Home banner only'],
  ['both', 'Top bar + home banner'],
]

function statusOf(a) {
  const now = Date.now()
  const utc = (v) => new Date(v.endsWith('Z') ? v : `${v}Z`).getTime()
  if (!a.is_active) return ['Off', 'text-slate']
  if (a.starts_at && utc(a.starts_at) > now) return ['Scheduled', 'text-slate']
  if (a.ends_at && utc(a.ends_at) < now) return ['Expired', 'text-riot']
  return ['Live', 'text-acid']
}

export default function AdminAnnouncements() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = () => client.get('/api/admin/announcements').then((res) => setRows(res.data)).catch(() => setError('Failed to load announcements'))
  useEffect(() => { load() }, [])

  const set = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const reset = () => { setForm(EMPTY); setEditingId(null); setError(null) }

  const edit = (a) => {
    setEditingId(a.id)
    setForm({ ...a, starts_at: toLocalInput(a.starts_at), ends_at: toLocalInput(a.ends_at) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const body = {
      message: form.message, detail: form.detail, coupon_code: form.coupon_code, link_url: form.link_url,
      link_label: form.link_label, style: form.style, placement: form.placement, is_active: form.is_active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    }
    try {
      if (editingId) await client.put(`/api/admin/announcements/${editingId}`, body)
      else await client.post('/api/admin/announcements', body)
      reset()
      await load()
    } catch (err) {
      setError(err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || 'Could not save the announcement.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (a) => { await client.patch(`/api/admin/announcements/${a.id}/toggle`).catch(() => alert('Failed to update.')); load() }
  const remove = async (a) => {
    if (!confirm(`Delete "${a.message}"?`)) return
    await client.delete(`/api/admin/announcements/${a.id}`).catch(() => alert('Failed to delete.'))
    if (editingId === a.id) reset()
    load()
  }

  if (!rows && !error) return <Loader label="Loading announcements" />

  const input = 'w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none'
  const label = 'font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5'

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-2">Announcements</h1>
      <p className="font-mono text-[11px] text-slate mb-8">Highlight an offer on your storefront. Anything you switch on shows immediately; set dates to schedule it.</p>

      <form onSubmit={submit} className="border border-panel-2 p-5 sm:p-6 space-y-5 mb-10">
        <h2 className="font-mono text-xs uppercase tracking-widest text-acid">{editingId ? 'Edit announcement' : 'New announcement'}</h2>

        <label className="block">
          <span className={label}>Headline (shown in the bar and banner)</span>
          <input name="message" value={form.message} onChange={set} maxLength={200} required placeholder="Buy 2 tees, get ₹200 off" className={input} />
        </label>
        <label className="block">
          <span className={label}>Extra line for the home banner (optional)</span>
          <input name="detail" value={form.detail} onChange={set} maxLength={300} placeholder="Limited to Drop 001. Free shipping included." className={input} />
        </label>

        <div className="grid sm:grid-cols-2 gap-5">
          <label className="block">
            <span className={label}>Coupon code (optional, customers tap to copy)</span>
            <input name="coupon_code" value={form.coupon_code} onChange={set} maxLength={50} placeholder="DROP200" className={`${input} font-mono uppercase`} />
          </label>
          <label className="block">
            <span className={label}>Where it shows</span>
            <select name="placement" value={form.placement} onChange={set} className={input}>
              {PLACEMENTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={label}>Button link (optional)</span>
            <input name="link_url" value={form.link_url} onChange={set} maxLength={300} placeholder="/shop or /customize" className={input} />
          </label>
          <label className="block">
            <span className={label}>Button text (optional)</span>
            <input name="link_label" value={form.link_label} onChange={set} maxLength={50} placeholder="Shop now" className={input} />
          </label>
          <label className="block">
            <span className={label}>Starts (optional)</span>
            <input name="starts_at" type="datetime-local" value={form.starts_at} onChange={set} className={input} />
          </label>
          <label className="block">
            <span className={label}>Ends (optional)</span>
            <input name="ends_at" type="datetime-local" value={form.ends_at} onChange={set} className={input} />
          </label>
        </div>

        <div>
          <span className={label}>Colour</span>
          <div className="flex gap-2 flex-wrap">
            {[['acid', 'Acid yellow'], ['riot', 'Riot red'], ['ink', 'Contrast']].map(([v, t]) => (
              <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, style: v }))} aria-pressed={form.style === v}
                className={`${STYLES[v]} font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 border-2 ${form.style === v ? 'border-paper' : 'border-transparent opacity-70'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* live preview */}
        {form.message && (
          <div>
            <span className={label}>Preview</span>
            <div className={`${STYLES[form.style]} px-4 py-2.5 text-center font-mono text-xs uppercase tracking-widest font-bold`}>
              {form.message}{form.link_url && <span className="underline underline-offset-4 ml-2">{form.link_label || 'Shop now'} →</span>}
              {form.coupon_code && <span className="ml-3 border border-dashed border-current px-2 py-0.5">Code: {form.coupon_code.toUpperCase()}</span>}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 font-mono text-xs text-paper">
          <input type="checkbox" name="is_active" checked={form.is_active} onChange={set} /> Active
        </label>

        {error && <p className="font-mono text-xs text-riot" role="alert">{typeof error === 'string' ? error : 'Could not save.'}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Publish'}
          </button>
          {editingId && <button type="button" onClick={reset} className="border border-panel-2 font-mono text-xs uppercase tracking-widest px-6 py-3 text-slate hover:text-paper">Cancel</button>}
        </div>
      </form>

      <div className="space-y-3">
        {rows?.length === 0 && <p className="font-mono text-sm text-slate">No announcements yet.</p>}
        {rows?.map((a) => {
          const [status, tone] = statusOf(a)
          return (
            <div key={a.id} className="border border-panel-2 bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-paper font-medium truncate">{a.message}</p>
                <p className="font-mono text-[11px] text-slate mt-1">
                  <span className={tone}>{status}</span> · {PLACEMENTS.find(([v]) => v === a.placement)?.[1]}{a.coupon_code ? ` · ${a.coupon_code}` : ''}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => edit(a)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-paper hover:border-acid hover:text-acid">Edit</button>
                <button onClick={() => toggle(a)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-paper hover:border-acid hover:text-acid">{a.is_active ? 'Turn off' : 'Turn on'}</button>
                <button onClick={() => remove(a)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate hover:border-riot hover:text-riot">Delete</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
