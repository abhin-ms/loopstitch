import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import client from '../../api/client'
import { CheckIcon } from '../icons'

export default function MobileOrderConfirmation() {
  const location = useLocation()
  const navigate = useNavigate()
  const orderFromState = location.state?.order
  const [order, setOrder] = useState(orderFromState || null)

  useEffect(() => {
    if (!orderFromState?.order_number || order) return
    client.get(`/api/orders/${orderFromState.order_number}`).then((res) => setOrder(res.data)).catch(() => {})
  }, [orderFromState, order])

  if (!order) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--ls-text-muted)', marginBottom: 14 }}>No order data found.</p>
        <button className="ls-btn-outline" style={{ width: 'auto' }} onClick={() => navigate('/app/shop')}>← Back to shop</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '36px 16px', textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, border: '2px solid var(--ls-accent)', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ls-accent)' }}>
        <CheckIcon />
      </div>
      <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>Order placed</h1>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--ls-text-muted)' }}>Order number</p>
      <p style={{ margin: '0 0 24px', fontSize: 16, fontWeight: 800, letterSpacing: '0.04em' }}>{order.order_number}</p>
      <p style={{ margin: '0 0 24px', fontSize: 13, lineHeight: 1.5, color: 'var(--ls-text-muted)' }}>
        We'll text you when it ships from Calicut. Track it any time from your order history.
      </p>
      <button className="ls-btn-primary" style={{ marginBottom: 10 }} onClick={() => navigate('/app/orders')}>View order history</button>
      <button className="ls-btn-outline" onClick={() => navigate('/app')}>Back to home</button>
    </div>
  )
}
