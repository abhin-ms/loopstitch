// Short vibration on supported devices (Android browsers). iOS Safari ignores it, so this is a progressive extra.
export function haptic(ms = 15) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigator.vibrate(ms)
    }
  } catch { /* vibration unavailable */ }
}
