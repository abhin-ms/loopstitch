import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useCustomerAuth } from '../../context/CustomerAuthContext'

export default function MobileLogin() {
  const { sendOTP, verifyOTP } = useCustomerAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.redirectTo || '/app/account'

  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSendOtp = async () => {
    if (phone.length !== 10) { setError('Please enter a valid 10-digit phone number'); return }
    setError(null)
    setLoading(true)
    try {
      await sendOTP(phone)
      setOtpSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (otp.length !== 6) { setError('Please enter the 6-digit code'); return }
    setError(null)
    setLoading(true)
    try {
      await verifyOTP(phone, otp)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 16px' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 800 }}>Log in</h1>
      <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--ls-text-muted)' }}>Track orders and reorder faster.</p>

      <p className="ls-field-label">Phone number</p>
      <input
        className="ls-input"
        style={{ marginBottom: 14 }}
        value={phone}
        disabled={otpSent}
        onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null) }}
        placeholder="10-digit number"
        inputMode="numeric"
      />

      {otpSent ? (
        <>
          <p className="ls-field-label">OTP — sent via WhatsApp</p>
          <input
            className="ls-input"
            style={{ marginBottom: 18 }}
            value={otp}
            onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
            placeholder="6-digit code"
            inputMode="numeric"
            autoFocus
          />
          {error && <p style={{ fontSize: 11, color: 'var(--ls-accent)', marginBottom: 14 }}>{error}</p>}
          <button className="ls-btn-primary" disabled={loading || otp.length !== 6} onClick={handleVerify}>
            {loading ? 'Verifying…' : 'Verify & log in →'}
          </button>
          <button
            style={{ marginTop: 14, border: 0, background: 'transparent', color: 'var(--ls-text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', width: '100%' }}
            onClick={() => { setOtpSent(false); setOtp(''); setError(null) }}
          >
            ← Change phone number
          </button>
        </>
      ) : (
        <>
          {error && <p style={{ fontSize: 11, color: 'var(--ls-accent)', marginBottom: 14 }}>{error}</p>}
          <button className="ls-btn-primary" style={{ marginTop: 4 }} disabled={loading || phone.length !== 10} onClick={handleSendOtp}>
            {loading ? 'Sending…' : 'Send OTP →'}
          </button>
        </>
      )}
    </div>
  )
}
