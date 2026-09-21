import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { useCustomerAuth } from '../../context/CustomerAuthContext'
import { formatINR } from '../../utils/format'
import StitchLoader from '../components/StitchLoader'

export default function MobileOrderHistory() {
  const { isAuthenticated, loading: authLoading } = useCustomerAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/app/login')
  }, [authLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (!isAuthenticated) return
    client.get('/api/orders/history').then((res) => setOrders(res.data)).catch(() => setOrders([]))
  }, [isAuthenticated])

  if (authLoading || !isAuthenticated || !orders) {
    return <StitchLoader label="Loading orders" />
  }

  return (
    <div style={{ padding: '18px 16px' }}>
      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--ls-text-muted)', marginBottom: 14 }}>No orders yet.</p>
          <button className="ls-btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/app/shop')}>Start shopping</button>
        </div>
      ) : (
        orders.map((o) => (
          <div key={o.id} style={{ border: '1px solid var(--ls-divider)', padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800 }}>#{o.order_number}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', background: 'var(--ls-accent-tint)', color: 'var(--ls-accent-tint-text)' }}>
                {o.status.toUpperCase()}
              </span>
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--ls-text-muted)' }}>
              {o.items.map((i) => i.product_name).join(', ')}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--ls-accent)' }}>{formatINR(o.total)}</p>
          </div>
        ))
      )}
    </div>
  )
}
