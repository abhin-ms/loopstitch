// Meta (Facebook / Instagram) Pixel for the storefront: PageView on every route change plus the
// standard shop events, so ads can be optimised and sales measured. Loaded only for shoppers —
// admin pages and logged-in admins never call these (see LaunchGate).
//
// Product ids match the catalogue feed (/api/feeds/meta-catalog.csv):
//   product group  LS{productId}                    variant  LS{productId}-{colorId|0}-{size}
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '1716589266071799'
const CURRENCY = 'INR'

let loaded = false
const recent = new Map()  // event signature -> when it was last sent

function fbq(...args) {
  if (typeof window === 'undefined') return
  // the same event twice within a second is a double render / double tap, not two actions
  const key = JSON.stringify(args.slice(0, 3))
  const now = Date.now()
  if (now - (recent.get(key) || 0) < 1000) return
  recent.set(key, now)
  if (!loaded) {
    loaded = true
    // Meta's standard loader, unchanged
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
      if (!f._fbq) f._fbq = n
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []
      t = b.createElement(e); t.async = !0; t.src = v
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    /* eslint-enable */
    window.fbq('init', PIXEL_ID)
  }
  try { window.fbq(...args) } catch { /* blocked by an ad blocker: the shop works the same */ }
}

export const groupId = (productId) => `LS${productId}`
export const variantId = (productId, colorId, size) => `LS${productId}-${colorId || 0}-${size}`

export function pageView() {
  fbq('track', 'PageView')
}

export function viewContent(product) {
  fbq('track', 'ViewContent', {
    content_ids: [groupId(product.id)],
    content_type: 'product_group',
    content_name: product.name,
    value: product.price,
    currency: CURRENCY,
  })
}

export function addToCart(product, colorId, size, quantity) {
  fbq('track', 'AddToCart', {
    content_ids: [variantId(product.id, colorId, size)],
    content_type: 'product',
    content_name: product.name,
    contents: [{ id: variantId(product.id, colorId, size), quantity, item_price: product.price }],
    value: product.price * quantity,
    currency: CURRENCY,
  })
}

// cart items: { productId, colorId, size, price, quantity }
export function initiateCheckout(items, value) {
  if (!items?.length) return
  const contents = items.map((i) => ({ id: variantId(i.productId, i.colorId, i.size), quantity: i.quantity, item_price: i.price }))
  fbq('track', 'InitiateCheckout', {
    content_ids: contents.map((c) => c.id),
    content_type: 'product',
    contents,
    num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    value,
    currency: CURRENCY,
  })
}

// Fired once per order on the confirmation page (refreshing the page must not count a second sale)
export function purchase(order) {
  if (!order?.order_number || ['cancelled', 'failed'].includes(order.status)) return
  const key = `loopstitch_px_purchase_${order.order_number}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch { /* storage blocked: still report the sale */ }
  const contents = (order.items || [])
    .filter((i) => i.product_id && !i.is_custom)
    .map((i) => ({ id: variantId(i.product_id, i.color_id, i.size), quantity: i.quantity, item_price: i.unit_price }))
  fbq('track', 'Purchase', {
    content_ids: contents.map((c) => c.id),
    content_type: 'product',
    contents,
    num_items: (order.items || []).reduce((sum, i) => sum + i.quantity, 0),
    value: order.total,
    currency: CURRENCY,
  }, { eventID: order.order_number })
}
