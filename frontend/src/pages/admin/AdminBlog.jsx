import { useEffect, useState } from 'react'
import client, { mediaUrl } from '../../api/client'
import Loader from '../../components/Loader'
import ArticleBody from '../../components/ArticleBody'

const EMPTY = { title: '', slug: '', excerpt: '', body: '', cover_url: '', is_published: false }
const input = 'w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none'
const label = 'font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5'
const btn = 'border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest'

export default function AdminBlog() {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState(null)

  const load = () => client.get('/api/admin/blog').then((res) => setRows(res.data)).catch(() => setError('Failed to load posts'))
  useEffect(() => { load() }, [])

  const set = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }
  const reset = () => { setForm(EMPTY); setEditingId(null); setError(null); setPreview(false) }
  const edit = (p) => { setEditingId(p.id); setForm({ title: p.title, slug: p.slug, excerpt: p.excerpt, body: p.body, cover_url: p.cover_url, is_published: p.is_published }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const uploadCover = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await client.post('/api/admin/blog/cover', body)
      setForm((f) => ({ ...f, cover_url: res.data.url }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Image upload failed.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editingId) await client.put(`/api/admin/blog/${editingId}`, form)
      else await client.post('/api/admin/blog', form)
      reset()
      load()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : d?.[0]?.msg || 'Could not save the post.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (p) => {
    if (!confirm(`Delete "${p.title}"?`)) return
    await client.delete(`/api/admin/blog/${p.id}`).catch(() => alert('Failed to delete.'))
    if (editingId === p.id) reset()
    load()
  }

  if (!rows && !error) return <Loader label="Loading posts" />

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-2">Journal</h1>
      <p className="font-mono text-[11px] text-slate mb-8">Articles that help people find you on Google, such as styling tips and drop stories. Published posts appear at /blog and in the sitemap.</p>

      <form onSubmit={submit} className="border border-panel-2 p-5 sm:p-6 space-y-5 mb-10">
        <h2 className="font-mono text-xs uppercase tracking-widest text-acid">{editingId ? 'Edit post' : 'New post'}</h2>
        <label className="block"><span className={label}>Title</span>
          <input name="title" value={form.title} onChange={set} required minLength={3} maxLength={200} placeholder="How to style an oversized t-shirt" className={input} />
        </label>
        <label className="block"><span className={label}>Web address (optional, made from the title)</span>
          <input name="slug" value={form.slug} onChange={set} maxLength={220} placeholder="how-to-style-an-oversized-t-shirt" className={`${input} font-mono`} />
        </label>
        <label className="block"><span className={label}>Summary for Google (about 150 characters) — {form.excerpt.length}/300</span>
          <textarea name="excerpt" value={form.excerpt} onChange={set} rows={2} maxLength={300} className={input} />
        </label>
        <div>
          <span className={label}>Cover image</span>
          {form.cover_url && <img src={mediaUrl(form.cover_url)} alt="" className="w-full max-w-sm aspect-[16/9] object-cover border border-panel-2 mb-2" />}
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadCover} className="font-mono text-xs text-slate" />
          {uploading && <p className="font-mono text-xs text-acid mt-1">Uploading…</p>}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className={label}>Article</span>
            <button type="button" onClick={() => setPreview((v) => !v)} className="font-mono text-[11px] uppercase tracking-widest text-slate hover:text-acid mb-1.5">{preview ? 'Edit' : 'Preview'}</button>
          </div>
          {preview ? (
            <div className="border border-panel-2 p-4 min-h-40"><ArticleBody text={form.body} /></div>
          ) : (
            <textarea name="body" value={form.body} onChange={set} rows={14} className={`${input} font-mono text-[13px] leading-relaxed`}
              placeholder={'Leave a blank line between paragraphs.\n\n## A heading starts with two hashes\n\n- Lines starting with a dash\n- become a bullet list'} />
          )}
        </div>
        <label className="flex items-center gap-2 font-mono text-xs text-paper">
          <input type="checkbox" name="is_published" checked={form.is_published} onChange={set} /> Published (visible on the site)
        </label>
        {error && <p className="font-mono text-xs text-riot" role="alert">{error}</p>}
        <div className="flex gap-3">
          <button disabled={saving || uploading} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors disabled:opacity-60">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save post'}</button>
          {editingId && <button type="button" onClick={reset} className="border border-panel-2 font-mono text-xs uppercase tracking-widest px-6 py-3 text-slate hover:text-paper">Cancel</button>}
        </div>
      </form>

      <div className="space-y-3">
        {rows?.length === 0 && <p className="font-mono text-sm text-slate">No posts yet.</p>}
        {rows?.map((p) => (
          <div key={p.id} className="border border-panel-2 bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-paper font-medium truncate">{p.title}</p>
              <p className="font-mono text-[11px] mt-1"><span className={p.is_published ? 'text-acid' : 'text-slate'}>{p.is_published ? 'Published' : 'Draft'}</span> <span className="text-slate">· /blog/{p.slug}</span></p>
            </div>
            <div className="flex gap-2 shrink-0">
              {p.is_published && <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" className={`${btn} text-paper hover:border-acid hover:text-acid`}>View</a>}
              <button onClick={() => edit(p)} className={`${btn} text-paper hover:border-acid hover:text-acid`}>Edit</button>
              <button onClick={() => remove(p)} className={`${btn} text-slate hover:border-riot hover:text-riot`}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
