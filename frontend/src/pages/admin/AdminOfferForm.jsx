import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client from '../../api/client'
import Loader from '../../components/Loader'

const emptyForm = {
  name: '', buy_quantity: 2, get_quantity: 1,
  scope: 'all', category: 'tshirt', product_ids: [],
  is_active: true, starts_at: '', ends_at: '',
}

export default function AdminOfferForm() {
  const { id } = useParams()
  const isEdit = id !== undefined
  const navigate = useNavigate()

  const [form, setForm] = useState(emptyForm)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    client.get('/api/admin/products').then((res) => {
      setProducts(res.data.filter((p) => p.is_active))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isEdit) return
    client.get(`/api/admin/offers`).then((res) => {
      const offer = res.data.find((o) => o.id === Number(id))
      if (!offer) throw new Error('not found')
      setForm({
        name: offer.name,
        buy_quantity: offer.buy_quantity,
        get_quantity: offer.get_quantity,
        scope: offer.scope,
        category: offer.category || 'tshirt',
        product_ids: offer.product_ids || [],
        is_active: offer.is_active,
        starts_at: toLocalInput(offer.starts_at),
        ends_at: toLocalInput(offer.ends_at),
      })
      setLoading(false)
    }).catch(() => {
      setError('Failed to load offer')
      setLoading(false)
    })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  const toggleProduct = (pid) => {
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(pid)
        ? f.product_ids.filter((x) => x !== pid)
        : [...f.product_ids, pid],
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (form.scope === 'products' && form.product_ids.length === 0) {
        throw new Error('Pick at least one product for this scope.')
      }
      const payload = {
        name: form.name.trim(),
        buy_quantity: Number(form.buy_quantity),
        get_quantity: Number(form.get_quantity),
        scope: form.scope,
        category: form.scope === 'category' ? form.category : null,
        product_ids: form.scope === 'products' ? form.product_ids : [],
        is_active: form.is_active,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      }
      if (isEdit) {
        await client.put(`/api/admin/offers/${id}`, payload)
      } else {
        await client.post('/api/admin/offers', payload)
      }
      navigate('/admin/offers')
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to save offer.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader label="Loading offer" />

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">{isEdit ? 'Edit offer' : 'New offer'}</h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="border border-panel-2 p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Deal</h2>
          <Field label="Offer name" name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Monsoon BOGO" />
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Buy quantity" name="buy_quantity" type="number" min="1" step="1" value={form.buy_quantity} onChange={handleChange} required />
            <Field label="Get quantity (free)" name="get_quantity" type="number" min="1" step="1" value={form.get_quantity} onChange={handleChange} required />
          </div>
          <p className="font-mono text-[11px] text-slate">
            Example — Buy 2 Get 1: customer puts 3 eligible tees in cart, the cheapest one becomes free.
            Buy 3 Get 3 with 6 items makes the 3 cheapest free.
          </p>
        </div>

        <div className="border border-panel-2 p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Applies to</h2>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Scope</span>
            <select name="scope" value={form.scope} onChange={handleChange} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none">
              <option value="all">All products</option>
              <option value="category">A category</option>
              <option value="products">Hand-picked products</option>
            </select>
          </label>

          {form.scope === 'category' && (
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Category</span>
              <select name="category" value={form.category} onChange={handleChange} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none">
                <option value="tshirt">T-Shirt</option>
                <option value="hoodie">Hoodie</option>
                <option value="accessory">Accessory</option>
              </select>
            </label>
          )}

          {form.scope === 'products' && (
            <div className="border border-panel-2 divide-y divide-panel-2 max-h-72 overflow-y-auto">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-panel/60">
                  <input
                    type="checkbox"
                    checked={form.product_ids.includes(p.id)}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <span className="text-paper text-sm flex-1 truncate">{p.name}</span>
                  <span className="font-mono text-[11px] text-slate">{p.category}</span>
                </label>
              ))}
              {products.length === 0 && (
                <p className="p-3 font-mono text-xs text-slate">No active products found.</p>
              )}
            </div>
          )}
        </div>

        <div className="border border-panel-2 p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Schedule &amp; status</h2>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Starts at (optional)" name="starts_at" type="datetime-local" value={form.starts_at} onChange={handleChange} />
            <Field label="Ends at (optional)" name="ends_at" type="datetime-local" value={form.ends_at} onChange={handleChange} />
          </div>
          <label className="flex items-center gap-2 font-mono text-xs text-paper">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} />
            Active (applies at checkout immediately)
          </label>
        </div>

        {error && <div className="border border-riot bg-riot/10 text-riot text-sm font-mono px-4 py-3">{error}</div>}

        <div className="flex flex-wrap gap-4">
          <button type="submit" disabled={saving} className="bg-riot text-ink font-mono text-sm uppercase tracking-widest px-8 py-3.5 hover:bg-acid transition-colors disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create offer'}
          </button>
          <button type="button" onClick={() => navigate('/admin/offers')} className="border border-panel-2 text-paper font-mono text-sm uppercase tracking-widest px-8 py-3.5 hover:border-paper transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)  // server stores UTC
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Field({ label, textarea, ...props }) {
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <label className="block">
      <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">{label}</span>
      <Tag {...props} rows={textarea ? 3 : undefined} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none transition-colors" />
    </label>
  )
}
