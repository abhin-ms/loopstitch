const KEY = 'loopstitch_recent'
const MAX = 8

export function readRecent() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

export function pushRecent(item) {
  try {
    const next = [item, ...readRecent().filter((r) => r.slug !== item.slug)].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* storage unavailable */ }
}
