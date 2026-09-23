// Product and journal pages arrive with structured data filled in by the server (for crawlers and
// link previews). Once the app takes over it writes its own, so drop the server copy to avoid duplicates.
export function removeServerLd(type) {
  document.querySelectorAll('script[type="application/ld+json"]:not([data-app-ld])').forEach((el) => {
    try {
      if (JSON.parse(el.textContent)['@type'] === type) el.remove()
    } catch { /* not ours */ }
  })
}
