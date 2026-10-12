// Storefront analytics: Meta (Facebook / Instagram) Pixel and, optionally, Google Analytics 4.
// PageView on every route change plus the standard shop events, so ads can be optimised and
// sales measured. Loaded only for shoppers — admin pages and logged-in admins never call
// these (see LaunchGate).
//
// The ids come from the server (META_PIXEL_ID / GA4_ID env vars, via /api/settings/launch);
// events fired before they arrive wait in a queue.
//
// Product ids match the catalogue feed (/feeds/meta.csv):  LS{productId}-{colorId|0}-{size}
// Purchase uses the order number as event id — the server sends the same event through the
// Conversions API (backend/app/meta_capi.py) and Meta keeps only one.
const DEFAULT_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '1716589266071799'
const CURRENCY = 'INR'

let config = null          // { pixelId, ga4Id } once known
const waiting = []         // events fired before config arrived
const recent = new Map()   // event signature -> when it was last sent

function loadPixel(pixelId) {
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
  window.fbq('init', pixelId)
}

function loadGa4(ga4Id) {
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', ga4Id, { send_page_view: false })  // page views are sent per route below
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`
  document.head.appendChild(script)
}

/** Called once the server has told us which ids to use (or with nothing, to use the default). */
export function configure({ pixelId, ga4Id } = {}) {
  if (config || typeof window === 'undefined') return
  config = { pixelId: pixelId || DEFAULT_PIXEL_ID, ga4Id: ga4Id || '' }
  try {
    if (config.pixelId) loadPixel(config.pixelId)
    if (config.ga4Id) loadGa4(config.ga4Id)
  } catch { /* blocked: the shop works the same */ }
  waiting.splice(0).forEach((event) => send(event))
}

// event: { meta: [name, params, options], ga: [name, params] }
function send(event) {
  if (typeof window === 'undefined') return
  if (!config) { waiting.push(event); return }
  // the same event twice within a second is a double render / double tap, not two actions
  const key = JSON.stringify(event.meta.slice(0, 2))
  const now = Date.now()
  if (now - (recent.get(key) || 0) < 1000) return
  recent.set(key, now)
  try {
    if (config.pixelId && window.fbq) window.fbq('track', ...event.meta)
    if (config.ga4Id && window.gtag && event.ga) window.gtag('event', ...event.ga)
  } catch { /* blocked by an ad blocker */ }
}

export const variantId = (productId, colorId, size) => `LS${productId}-${colorId || 0}-${size}`

// every colour + size of a product, as listed in the catalogue feed
function variantIds(product) {
  const colors = product.colors?.length ? product.colors : [{ id: 0, sizes: product.sizes || [] }]
  return colors.flatMap((color) => (color.sizes || []).map((s) => variantId(product.id, color.id, s.size)))
}

const gaItem = (id, name, price, quantity = 1) => ({ item_id: id, item_name: name, item_brand: 'Loopstitch', price, quantity })

export function pageView() {
  send({
    meta: ['PageView'],
    ga: ['page_view', { page_location: window.location.href, page_path: window.location.pathname, page_title: document.title }],
  })
}

export function viewContent(product) {
  send({
    meta: ['ViewContent', { content_ids: variantIds(product), content_type: 'product', content_name: product.name, value: product.price, currency: CURRENCY }],
    ga: ['view_item', { currency: CURRENCY, value: product.price, items: [gaItem(`LS${product.id}`, product.name, product.price)] }],
  })
}

export function addToCart(product, colorId, size, quantity) {
  const id = variantId(product.id, colorId, size)
  const value = product.price * quantity
  send({
    meta: ['AddToCart', {
      content_ids: [id], content_type: 'product', content_name: product.name,
      contents: [{ id, quantity, item_price: product.price }], value, currency: CURRENCY,
    }],
    ga: ['add_to_cart', { currency: CURRENCY, value, items: [gaItem(id, product.name, product.price, quantity)] }],
  })
}

// cart items: { productId, colorId, size, name, price, quantity }
export function initiateCheckout(items, value) {
  if (!items?.length) return
  const contents = items.map((i) => ({ id: variantId(i.productId, i.colorId, i.size), quantity: i.quantity, item_price: i.price }))
  send({
    meta: ['InitiateCheckout', {
      content_ids: contents.map((c) => c.id), content_type: 'product', contents,
      num_items: items.reduce((sum, i) => sum + i.quantity, 0), value, currency: CURRENCY,
    }],
    ga: ['begin_checkout', { currency: CURRENCY, value, items: items.map((i) => gaItem(variantId(i.productId, i.colorId, i.size), i.name, i.price, i.quantity)) }],
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
  const lines = (order.items || []).filter((i) => i.product_id && !i.is_custom)
  const contents = lines.map((i) => ({ id: variantId(i.product_id, i.color_id, i.size), quantity: i.quantity, item_price: i.unit_price }))
  send({
    meta: ['Purchase', {
      content_ids: contents.map((c) => c.id), content_type: 'product', contents,
      num_items: (order.items || []).reduce((sum, i) => sum + i.quantity, 0), value: order.total, currency: CURRENCY,
    }, { eventID: order.order_number }],
    ga: ['purchase', {
      transaction_id: order.order_number, currency: CURRENCY, value: order.total, shipping: order.shipping_fee || 0,
      items: lines.map((i) => gaItem(variantId(i.product_id, i.color_id, i.size), i.product_name, i.unit_price, i.quantity)),
    }],
  })
}
