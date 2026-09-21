import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const WishlistContext = createContext(null)
const STORAGE_KEY = 'loopstitch_wishlist'

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch { /* storage unavailable */ }
  }, [ids])

  const value = useMemo(() => ({
    ids,
    has: (id) => ids.includes(id),
    toggle: (id) => setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
  }), [ids])

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export const useWishlist = () => useContext(WishlistContext)
