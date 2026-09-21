import { useNavigate } from 'react-router-dom'
import { useCustomerAuth } from '../../context/CustomerAuthContext'

export default function MobileAccount() {
  const navigate = useNavigate()
  const { customer, isAuthenticated, logout } = useCustomerAuth()

  if (!isAuthenticated) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--ls-text-muted)' }}>
          Log in to track orders and reorder faster.
        </p>
        <button className="ls-btn-primary" onClick={() => navigate('/app/login')}>Log in →</button>
      </div>
    )
  }

  const name = customer?.name || 'Customer'
  const initial = name.charAt(0).toUpperCase()

  return (
    <div style={{ padding: '18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: '2px solid var(--ls-divider)', marginBottom: 6 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--ls-accent-tint)', color: 'var(--ls-accent-tint-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
          {initial}
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{name}</p>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ls-text-muted)' }}>{customer?.phone}</p>
        </div>
      </div>
      <button
        style={{ width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid var(--ls-divider)', background: 'transparent', color: 'var(--ls-text)', fontSize: 13, fontWeight: 600, padding: '14px 0', cursor: 'pointer' }}
        onClick={() => navigate('/app/orders')}
      >
        My orders
      </button>
      <button
        style={{ width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid var(--ls-divider)', background: 'transparent', color: 'var(--ls-text)', fontSize: 13, fontWeight: 600, padding: '14px 0', cursor: 'pointer' }}
        onClick={() => navigate('/app/customize')}
      >
        Custom print studio
      </button>
      <button
        style={{ width: '100%', textAlign: 'left', border: 0, background: 'transparent', color: 'var(--ls-accent)', fontSize: 13, fontWeight: 700, padding: '14px 0', cursor: 'pointer' }}
        onClick={() => { logout(); navigate('/app') }}
      >
        Log out
      </button>
    </div>
  )
}
