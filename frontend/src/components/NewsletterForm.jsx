import { useState } from 'react'
import client from '../api/client'

export default function NewsletterForm({ source = 'home' }) {
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState({ state: 'idle', message: '' })

  const submit = async (e) => {
    e.preventDefault()
    setStatus({ state: 'loading', message: '' })
    try {
      const res = await client.post('/api/subscribe', { contact, source })
      setStatus({ state: 'done', message: res.data.detail })
      setContact('')
    } catch (err) {
      const detail = err.response?.data?.detail
      setStatus({ state: 'error', message: typeof detail === 'string' ? detail : 'Something went wrong. Please try again.' })
    }
  }

  if (status.state === 'done') {
    return <p className="font-mono text-sm text-acid" role="status">✓ {status.message}</p>
  }

  return (
    <form onSubmit={submit} className="w-full sm:max-w-md">
      <label htmlFor={`notify-${source}`} className="sr-only">Email or WhatsApp number</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id={`notify-${source}`}
          type="text"
          inputMode="email"
          required
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email or WhatsApp number"
          className="field-input flex-1"
        />
        <button
          type="submit"
          disabled={status.state === 'loading'}
          className="shrink-0 border border-riot bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid hover:border-acid transition-colors disabled:opacity-60"
        >
          {status.state === 'loading' ? 'Saving…' : 'Notify me'}
        </button>
      </div>
      {status.state === 'error' && <p className="font-mono text-xs text-riot mt-2" role="alert">{status.message}</p>}
    </form>
  )
}
