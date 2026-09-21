import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null)
  const timeoutRef = useRef(null)

  const showToast = useCallback((msg) => {
    setMessage(msg)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setMessage(null), 1600)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && <div className="ls-toast">{message}</div>}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
