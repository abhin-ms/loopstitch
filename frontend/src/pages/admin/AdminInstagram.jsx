import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'

export default function AdminInstagram() {
  const [rows, setRows] = useState(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => client.get('/api/admin/instagram').then((res) => setRows(res.data)).catch(() => setError('Failed to load posts'))
  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await client.post('/api/admin/instagram', { url })
      setUrl('')
      await load()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not add that link.')
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (p) => { await client.patch(`/api/admin/instagram/${p.id}/toggle`).catch(() => alert('Failed to update.')); load() }
  const remove = async (p) => {
    if (!confirm('Remove this post from the website?')) return
    await client.delete(`/api/admin/instagram/${p.id}`).catch(() => alert('Failed to remove.'))
    load()
  }

  if (!rows && !error) return <Loader label="Loading posts" />

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-2">Instagram posts</h1>
      <p className="font-mono text-[11px] text-slate mb-8">
        Paste the link of a public post or reel (Instagram → ⋯ → Copy link). It appears in the &ldquo;Fresh off the feed&rdquo; section on the home page. The newest 6 active posts are shown. Private accounts can&apos;t be embedded.
      </p>

      <form onSubmit={add} className="flex flex-col sm:flex-row gap-2 mb-3">
        <label className="sr-only" htmlFor="ig-url">Instagram post or reel link</label>
        <input id="ig-url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://www.instagram.com/reel/..." className="flex-1 bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
        <button disabled={busy} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors disabled:opacity-60">{busy ? 'Adding…' : 'Add post'}</button>
      </form>
      {error && <p className="font-mono text-xs text-riot mb-4" role="alert">{error}</p>}

      <div className="space-y-3 mt-6">
        {rows?.length === 0 && <p className="font-mono text-sm text-slate">No posts added yet.</p>}
        {rows?.map((p) => (
          <div key={p.id} className="border border-panel-2 bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <a href={`https://www.instagram.com/${p.kind}/${p.shortcode}/`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-paper hover:text-acid">
                {p.kind === 'reel' ? 'Reel' : 'Post'} · {p.shortcode} ↗
              </a>
              <p className={`font-mono text-[11px] mt-1 ${p.is_active ? 'text-acid' : 'text-slate'}`}>{p.is_active ? 'Showing on site' : 'Hidden'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggle(p)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-paper hover:border-acid hover:text-acid">{p.is_active ? 'Hide' : 'Show'}</button>
              <button onClick={() => remove(p)} className="border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-slate hover:border-riot hover:text-riot">Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
