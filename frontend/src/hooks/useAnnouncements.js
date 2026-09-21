import { useEffect, useState } from 'react'
import client from '../api/client'

// One request shared by the top bar and the home banner
let cache = null

export default function useAnnouncements() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    if (!cache) cache = client.get('/api/announcements').then((res) => res.data).catch(() => { cache = null; return [] })
    cache.then((data) => { if (alive) setItems(data) })
    return () => { alive = false }
  }, [])

  return items
}
