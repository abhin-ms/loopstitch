import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import useNoIndex from '../../hooks/useNoIndex'

export default function AdminLogin() {
  useNoIndex()
  const { login, isAuthenticated, loading } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && isAuthenticated) {
    const redirectTo = location.state?.from || '/admin/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
      navigate('/admin/dashboard', { replace: true })
    } catch {
      setError('Invalid username or password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="font-display text-2xl text-paper mb-1">LOOPSTITCH<span className="text-riot">.</span></div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-slate">Admin access</p>
        </div>

        <form onSubmit={handleSubmit} className="border border-panel-2 p-7 space-y-5">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none"
            />
          </label>

          {error && <div className="border border-riot bg-riot/10 text-riot text-xs font-mono px-3 py-2">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-riot text-ink font-mono text-sm uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
