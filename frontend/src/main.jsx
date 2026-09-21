import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Hold the boot splash for a minimum stretch so it reads as an
// intentional brand moment rather than a flicker on fast connections,
// then fade it out once React has actually mounted.
const MIN_SPLASH_MS = 500
const elapsed = Date.now() - (window.__bootStart || Date.now())
setTimeout(() => {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  splash.classList.add('is-hidden')
  setTimeout(() => splash.remove(), 400)
}, Math.max(0, MIN_SPLASH_MS - elapsed))
