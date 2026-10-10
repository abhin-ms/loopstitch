import { useEffect, useState } from 'react'
import client from '../../api/client'
import Loader from '../../components/Loader'
import { formatINR } from '../../utils/format'

// launch_date is stored as UTC ISO; <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"
function toLocalInput(iso) {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function toIso(local) {
  return local ? new Date(local).toISOString() : ''
}
const fromApi = (data) => ({ ...data, launch_date: toLocalInput(data.launch_date) })

export default function AdminSettings() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    client.get('/api/admin/settings').then((res) => setForm(fromApi(res.data))).catch(() => setError('Failed to load settings'))
  }, [])

  // Launch mode saves on click so the site flips immediately
  const toggleLaunchMode = async () => {
    setToggling(true)
    setError(null)
    try {
      const res = await client.patch('/api/admin/settings', {
        launch_mode: !form.launch_mode,
        launch_date: toIso(form.launch_date),
        launch_message: form.launch_message || '',
        launch_auto_open: !!form.launch_auto_open,
        launch_alerts_enabled: !!form.launch_alerts_enabled,
      })
      setForm(fromApi(res.data))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update launch mode.')
    } finally {
      setToggling(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    setSaved(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await client.patch('/api/admin/settings', {
        delivery_fee: Number(form.delivery_fee),
        free_shipping_threshold: Number(form.free_shipping_threshold),
        razorpay_key_id: form.razorpay_key_id || '',
        razorpay_key_secret: form.razorpay_key_secret || '',
        cod_advance_percent: Number(form.cod_advance_percent),
        cod_enabled: form.cod_enabled,
        launch_date: toIso(form.launch_date),
        launch_message: form.launch_message || '',
        launch_auto_open: !!form.launch_auto_open,
        launch_alerts_enabled: !!form.launch_alerts_enabled,
        ship_auto_pickup: form.ship_auto_pickup,
        ship_pickup_location: form.ship_pickup_location || '',
        ship_days_standard: Number(form.ship_days_standard),
        ship_days_custom: Number(form.ship_days_custom),
        ship_weight_grams: Number(form.ship_weight_grams),
        ship_box_cm: form.ship_box_cm || '30x25x5',
        ship_run_hour: Number(form.ship_run_hour),
      })
      setForm(fromApi(res.data))
      setSaved(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !form) return <p className="text-riot font-mono text-sm">{error}</p>
  if (!form) return <Loader label="Loading settings" />

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-8">Store settings</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Launching soon page */}
        <div className={`border p-6 space-y-5 ${form.launch_mode ? 'border-acid' : 'border-panel-2'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Launching soon page</h2>
              <p className="font-mono text-[11px] text-slate mt-1.5">
                {form.launch_mode
                  ? 'ENABLED — visitors only see the launching soon page. You still see the full site while logged in as admin.'
                  : 'DISABLED — the full store is live for everyone.'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleLaunchMode}
              disabled={toggling}
              className={`shrink-0 font-mono text-sm uppercase tracking-widest px-6 py-3 border transition-colors disabled:opacity-60 ${
                form.launch_mode
                  ? 'bg-acid border-acid text-ink hover:bg-transparent hover:text-acid'
                  : 'border-panel-2 text-paper hover:border-acid hover:text-acid'
              }`}
            >
              {toggling ? 'Saving…' : form.launch_mode ? 'Disable' : 'Enable'}
            </button>
          </div>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Launch date &amp; time (optional — shows a countdown)</span>
            <input
              name="launch_date" type="datetime-local"
              value={form.launch_date || ''} onChange={handleChange}
              className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono"
            />
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="launch_auto_open" checked={!!form.launch_auto_open} onChange={handleChange} className="accent-acid mt-0.5" />
            <div>
              <span className="font-mono text-sm text-paper">Open the store automatically when the countdown ends</span>
              <p className="font-mono text-[11px] text-slate">
                {form.launch_auto_open
                  ? 'At the launch time visitors get the full store — no need to press Disable. Click "Save settings" to apply.'
                  : 'Off — the launching soon page stays up until you press Disable.'}
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="launch_alerts_enabled" checked={!!form.launch_alerts_enabled} onChange={handleChange} className="accent-acid mt-0.5" />
            <div>
              <span className="font-mono text-sm text-paper">Message subscribers (email / WhatsApp)</span>
              <p className="font-mono text-[11px] text-slate">
                {form.launch_alerts_enabled
                  ? '"You\'re on the list" right after they subscribe, and "1 minute to go" one minute before the launch time. Send tests from Admin → Subscribers first.'
                  : 'Off — subscribers get no automatic messages.'}
              </p>
            </div>
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Message (optional)</span>
            <textarea
              name="launch_message" rows="3" maxLength={200}
              value={form.launch_message || ''} onChange={handleChange}
              placeholder="Our first drop of unisex oversized anime tees is almost ready…"
              className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono"
            />
          </label>
          <a href="/?preview-launch" target="_blank" rel="noopener noreferrer" className="inline-block font-mono text-[11px] uppercase tracking-widest text-acid underline">
            Preview launching soon page ↗
          </a>
        </div>

        {/* Delivery charges */}
        <div className="border border-panel-2 p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Delivery charges</h2>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Delivery fee (₹)</span>
            <input
              name="delivery_fee" type="number" min="0" step="1"
              value={form.delivery_fee} onChange={handleChange} required
              className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Free delivery on orders above (₹)</span>
            <input
              name="free_shipping_threshold" type="number" min="0" step="1"
              value={form.free_shipping_threshold} onChange={handleChange} required
              className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono"
            />
            <span className="font-mono text-[11px] text-slate block mt-2">
              Current rule: {formatINR(Number(form.free_shipping_threshold))}+ ships free, otherwise {formatINR(Number(form.delivery_fee))}. Free shipping is judged on cart value before discounts.
            </span>
          </label>
        </div>

        {/* Delhivery automatic pickups */}
        <div className="border border-panel-2 p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Delhivery shipping</h2>
          {!form.ship_configured && (
            <p className="border border-riot bg-riot/10 text-riot text-[11px] font-mono px-3 py-2">
              Delhivery API token is not set on the server (DELHIVERY_API_TOKEN), so pickups can't be booked yet.
            </p>
          )}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="ship_auto_pickup" checked={form.ship_auto_pickup} onChange={handleChange} className="accent-acid" />
            <div>
              <span className="font-mono text-sm text-paper">Book pickups automatically</span>
              <p className="font-mono text-[11px] text-slate">
                Every day at {String(form.ship_run_hour).padStart(2, '0')}:00 IST, paid orders due for the next pickup day get a Delhivery tracking id, one pickup is booked, and each customer gets a WhatsApp with their tracking id. No pickups on Sundays.
              </p>
            </div>
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Pickup location name (exactly as in Delhivery One)</span>
            <input name="ship_pickup_location" value={form.ship_pickup_location || ''} onChange={handleChange} placeholder="e.g. Loopstitch Warehouse" className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Pickup after (days) — regular</span>
              <input name="ship_days_standard" type="number" min="1" max="30" value={form.ship_days_standard} onChange={handleChange} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Pickup after (days) — custom</span>
              <input name="ship_days_custom" type="number" min="1" max="30" value={form.ship_days_custom} onChange={handleChange} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Weight per tee (grams)</span>
              <input name="ship_weight_grams" type="number" min="50" step="10" value={form.ship_weight_grams} onChange={handleChange} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
            </label>
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Box size L×W×H (cm)</span>
              <input name="ship_box_cm" value={form.ship_box_cm || ''} onChange={handleChange} placeholder="30x25x5" className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
            </label>
            <label className="block col-span-2 sm:col-span-1">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Daily booking time (hour, IST)</span>
              <input name="ship_run_hour" type="number" min="0" max="23" value={form.ship_run_hour} onChange={handleChange} className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono" />
            </label>
          </div>
        </div>

        {/* Payment methods */}
        <div className="border border-panel-2 p-6 space-y-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-acid">Payment methods</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox" name="cod_enabled"
              checked={form.cod_enabled} onChange={handleChange}
              className="accent-acid"
            />
            <div>
              <span className="font-mono text-sm text-paper">Cash on Delivery</span>
              <p className="font-mono text-[11px] text-slate">
                {form.cod_enabled
                  ? 'COD is enabled — customers pay an advance online and the rest on delivery.'
                  : 'COD is disabled — only full online payment via Razorpay is available at checkout.'}
              </p>
            </div>
          </label>
          {form.cod_enabled && (
            <label className="block">
              <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">COD advance percentage (%)</span>
              <input
                name="cod_advance_percent" type="number" min="0" max="100" step="1"
                value={form.cod_advance_percent} onChange={handleChange}
                className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none font-mono"
              />
              <span className="font-mono text-[11px] text-slate block mt-1">
                Customers pay this percentage online via Razorpay at checkout. The remaining {100 - form.cod_advance_percent}% is collected on delivery.
              </span>
            </label>
          )}
        </div>

        {error && <div className="border border-riot bg-riot/10 text-riot text-sm font-mono px-4 py-3">{error}</div>}
        {saved && <div className="border border-acid bg-acid/10 text-acid text-sm font-mono px-4 py-3">Settings saved — applies to new checkouts immediately.</div>}

        <button type="submit" disabled={saving} className="w-full sm:w-auto bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 sm:px-8 py-3.5 hover:bg-acid transition-colors disabled:opacity-60">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  )
}
