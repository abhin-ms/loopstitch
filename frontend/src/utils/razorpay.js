// Razorpay's checkout script is only needed on payment screens, so it is loaded on demand
// instead of blocking every page. Safe to call repeatedly.
let pending = null

export function loadRazorpay() {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  if (pending) return pending
  pending = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => { pending = null; script.remove(); resolve(false) }
    document.body.appendChild(script)
  })
  return pending
}
