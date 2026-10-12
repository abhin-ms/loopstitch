import axios from 'axios'

// In dev, Vite proxies nothing by default, so point straight at the API.
// In production, set VITE_API_URL to your deployed backend, e.g. https://api.loopstitch.online
export const API_BASE = import.meta.env.VITE_API_URL || ''

const client = axios.create({
  baseURL: API_BASE,
})

client.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('loopstitch_admin_token')
  const customerToken = localStorage.getItem('loopstitch_customer_token')

  if (adminToken && config.url?.includes('/admin')) {
    config.headers.Authorization = `Bearer ${adminToken}`
  } else if (customerToken && !config.url?.includes('/admin')) {
    config.headers.Authorization = `Bearer ${customerToken}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname.startsWith('/admin')) {
      localStorage.removeItem('loopstitch_admin_token')
      if (window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login'
      }
    }
    return Promise.reject(err)
  }
)

export const mediaUrl = (path) => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${API_BASE}${path}`
}

// srcset of the smaller WebP copies made on upload (backend/app/imaging.py). Spread onto an <img>
// whose src is the original: <img src={mediaUrl(img.url)} {...responsive(img, '50vw')} />.
// Images uploaded before the copies existed simply get no srcset.
export const responsive = (image, sizes) => {
  if (!image?.webp_base) return {}
  const base = mediaUrl(image.webp_base)
  return { srcSet: `${base}_w640.webp 640w, ${base}_w1280.webp 1280w`, sizes }
}

export default client
