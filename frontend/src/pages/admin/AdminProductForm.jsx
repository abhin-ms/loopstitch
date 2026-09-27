import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import client, { mediaUrl } from '../../api/client'
import Loader from '../../components/Loader'

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL']
const makeSizes = () => DEFAULT_SIZES.map((size) => ({ size, stock: 0 }))
const makeColor = (name = 'Black') => ({ name, hex_code: '#000000', sizes: makeSizes(), images: [] })
const emptyForm = {
  name: '', description: '', price: '', compare_at_price: '', category: 'tshirt',
  colorway: '', meta_title: '', meta_description: '', is_active: true, is_featured: false,
}

export default function AdminProductForm() {
  const { id } = useParams()
  const isEdit = id !== undefined
  const navigate = useNavigate()
  const [form, setForm] = useState(emptyForm)
  const [colors, setColors] = useState([makeColor()])
  const [productId, setProductId] = useState(id ? Number(id) : null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isEdit) return
    client.get(`/api/admin/products/${id}`).then(({ data: p }) => {
      setForm({
        name: p.name, description: p.description || '', price: p.price,
        compare_at_price: p.compare_at_price ?? '', category: p.category,
        colorway: p.colorway || '', meta_title: p.meta_title || '',
        meta_description: p.meta_description || '', is_active: p.is_active, is_featured: p.is_featured,
      })
      setColors(p.colors?.length ? p.colors : [{
        ...makeColor(p.colorway || 'Default'), sizes: p.sizes || [], images: p.images || [],
      }])
      setLoading(false)
    }).catch(() => { setError('Failed to load product'); setLoading(false) })
  }, [id, isEdit])

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  const updateColor = (index, field, value) => {
    setColors((current) => current.map((color, i) => i === index ? { ...color, [field]: value } : color))
  }

  const updateSize = (colorIndex, sizeIndex, field, value) => {
    setColors((current) => current.map((color, i) => i !== colorIndex ? color : {
      ...color,
      sizes: color.sizes.map((size, j) => j === sizeIndex ? { ...size, [field]: field === 'stock' ? Number(value) : value } : size),
    }))
  }

  const addColor = () => setColors((current) => [...current, makeColor(`Color ${current.length + 1}`)])
  const removeColor = (index) => setColors((current) => current.filter((_, i) => i !== index))
  const addSize = (colorIndex) => setColors((current) => current.map((color, i) => i === colorIndex ? { ...color, sizes: [...color.sizes, { size: '', stock: 0 }] } : color))
  const removeSize = (colorIndex, sizeIndex) => setColors((current) => current.map((color, i) => i === colorIndex ? { ...color, sizes: color.sizes.filter((_, j) => j !== sizeIndex) } : color))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        compare_at_price: form.compare_at_price === '' ? null : Number(form.compare_at_price),
        colors: colors.map((color, position) => ({
          ...(color.id ? { id: color.id } : {}), name: color.name.trim(), hex_code: color.hex_code,
          position, sizes: color.sizes.filter((size) => size.size.trim()).map((size) => ({ ...size, size: size.size.trim().toUpperCase() })),
        })).filter((color) => color.name),
      }
      const res = isEdit
        ? await client.put(`/api/admin/products/${id}`, payload)
        : await client.post('/api/admin/products', payload)
      if (!isEdit) {
        setProductId(res.data.id)
        navigate(`/admin/products/${res.data.id}`, { replace: true })
      } else {
        setProductId(Number(id))
        setColors(res.data.colors || colors)
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save product.')
    } finally { setSaving(false) }
  }

  const handleImageUpload = async (colorId, e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !productId || !colorId) return
    setUploading(colorId)
    setError(null)
    try {
      const fd = new FormData()
      files.forEach((file) => fd.append('files', file))
      await client.post(`/api/admin/products/${productId}/images`, fd, {
        params: { color_id: colorId }, headers: { 'Content-Type': 'multipart/form-data' },
      })
      const refreshed = await client.get(`/api/admin/products/${productId}`)
      setColors(refreshed.data.colors || colors)
    } catch { setError('Image upload failed. Use JPG, PNG, WEBP, or GIF.') }
    finally { setUploading(null); e.target.value = '' }
  }

  const handleImageDelete = async (colorId, imageId) => {
    try {
      await client.delete(`/api/admin/products/${productId}/images/${imageId}`)
      const refreshed = await client.get(`/api/admin/products/${productId}`)
      setColors(refreshed.data.colors || colors)
    } catch { alert('Failed to delete image.') }
  }

  if (loading) return <Loader label="Loading product" />

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">{isEdit ? 'Edit product' : 'New product'}</h1>
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="border border-panel-2 p-4 sm:p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Details</h2>
          <Field label="Name" name="name" value={form.name} onChange={handleChange} required />
          <Field label="Description" name="description" value={form.description} onChange={handleChange} textarea />
          <div className="grid sm:grid-cols-3 gap-5">
            <Field label="Price (₹)" name="price" type="number" min="0" step="1" value={form.price} onChange={handleChange} required />
            <Field label="Compare-at price (₹)" name="compare_at_price" type="number" min="0" step="1" value={form.compare_at_price} onChange={handleChange} />
            <label className="block"><span className="field-label">Category</span><select name="category" value={form.category} onChange={handleChange} className="field-input"><option value="tshirt">T-Shirt</option><option value="hoodie">Hoodie</option><option value="accessory">Accessory</option></select></label>
          </div>
          <Field label="Legacy colorway label (optional)" name="colorway" value={form.colorway} onChange={handleChange} placeholder="Used only as a fallback label" />
          <div className="flex flex-wrap gap-8"><Check name="is_active" checked={form.is_active} onChange={handleChange}>Active (visible on storefront)</Check><Check name="is_featured" checked={form.is_featured} onChange={handleChange}>Featured (shows on homepage)</Check></div>
        </div>

        <div className="border border-panel-2 p-4 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-mono text-xs uppercase tracking-widest text-acid">Colors, images &amp; stock</h2><p className="font-mono text-[11px] text-slate mt-2">Every color has its own gallery and size stock.</p></div><button type="button" onClick={addColor} className="border border-acid text-acid px-3 py-2 font-mono text-[11px] uppercase tracking-widest">+ Add color</button></div>
          {colors.map((color, colorIndex) => (
            <div key={color.id || colorIndex} className="border border-panel-2 p-4 space-y-5">
              <div className="flex flex-wrap items-end gap-3"><label className="flex-1 min-w-40"><span className="field-label">Color name</span><input value={color.name} onChange={(e) => updateColor(colorIndex, 'name', e.target.value)} className="field-input" placeholder="Black" required /></label><label><span className="field-label">Swatch</span><input type="color" value={color.hex_code || '#000000'} onChange={(e) => updateColor(colorIndex, 'hex_code', e.target.value)} className="h-11 w-16 bg-panel border border-panel-2 p-1" /></label>{colors.length > 1 && <button type="button" onClick={() => removeColor(colorIndex)} className="text-riot font-mono text-[11px] uppercase tracking-widest px-2 py-2">Remove</button>}</div>
              <div><div className="flex items-center justify-between mb-3"><span className="field-label">Sizes &amp; stock</span><button type="button" onClick={() => addSize(colorIndex)} className="text-slate hover:text-paper font-mono text-[11px] uppercase tracking-widest px-3 py-3 -mr-3">+ Add size</button></div><div className="space-y-2">{color.sizes.map((size, sizeIndex) => <div key={sizeIndex} className="flex flex-wrap items-center gap-2"><input value={size.size} onChange={(e) => updateSize(colorIndex, sizeIndex, 'size', e.target.value.toUpperCase())} className="field-input w-24" placeholder="SIZE" /><input type="number" min="0" value={size.stock} onChange={(e) => updateSize(colorIndex, sizeIndex, 'stock', e.target.value)} className="field-input w-28" placeholder="Stock" /><span className="font-mono text-[11px] text-slate">{size.stock === 0 ? 'locked' : `${size.stock} units`}</span><button type="button" onClick={() => removeSize(colorIndex, sizeIndex)} className="text-riot font-mono text-[11px] px-2 py-2">Remove</button></div>)}</div></div>
              <div><span className="field-label block mb-3">Images for {color.name || 'this color'}</span>{!productId || !color.id ? <p className="font-mono text-xs text-slate">Save the product first, then upload color images.</p> : <><div className="flex flex-wrap gap-3 mb-4">{(color.images || []).map((image) => <div key={image.id} className="relative w-24 h-28 group"><img src={mediaUrl(image.url)} alt={`${color.name} product`} className="w-full h-full object-cover" /><button type="button" onClick={() => handleImageDelete(color.id, image.id)} className="absolute top-1 right-1 bg-ink/80 text-riot w-11 h-11 opacity-100 lg:opacity-0 lg:group-hover:opacity-100" aria-label="Delete image">✕</button></div>)}</div><input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(color.id, e)} className="font-mono text-xs text-slate w-full py-2 file:mr-3 file:border file:border-panel-2 file:bg-panel file:px-4 file:py-2.5 file:font-mono file:text-xs file:uppercase file:tracking-widest file:text-paper" />{uploading === color.id && <p className="font-mono text-xs text-acid mt-2">Uploading…</p>}</>}</div>
            </div>
          ))}
        </div>

        <div className="border border-panel-2 p-4 sm:p-6 space-y-5"><h2 className="font-mono text-xs uppercase tracking-widest text-acid">Search engine preview</h2><Field label="Meta title" name="meta_title" value={form.meta_title} onChange={handleChange} placeholder="Defaults to product name" maxLength={255} /><Field label="Meta description" name="meta_description" value={form.meta_description} onChange={handleChange} textarea maxLength={320} placeholder="A concise description for search results" /></div>
        {error && <div className="border border-riot bg-riot/10 text-riot text-sm font-mono px-4 py-3">{error}</div>}
        <div className="flex flex-wrap gap-4"><button type="submit" disabled={saving} className="bg-riot text-ink font-mono text-sm uppercase tracking-widest px-8 py-3.5 hover:bg-acid disabled:opacity-60">{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}</button><button type="button" onClick={() => navigate('/admin/products')} className="border border-panel-2 text-paper font-mono text-sm uppercase tracking-widest px-8 py-3.5">Cancel</button></div>
      </form>
    </div>
  )
}

function Check({ children, ...props }) { return <label className="flex items-center gap-2 font-mono text-xs text-paper"><input type="checkbox" {...props} />{children}</label> }
function Field({ label, textarea, ...props }) { const Tag = textarea ? 'textarea' : 'input'; return <label className="block"><span className="field-label">{label}</span><Tag {...props} rows={textarea ? 4 : undefined} className="field-input" /></label> }
