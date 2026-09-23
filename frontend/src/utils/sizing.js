// Garment measurements (inches) for the unisex oversized, dropped-shoulder cut.
// Confirm these against the real garments before relying on them.
export const SIZE_CHART = [
  { size: 'S', chest: 40, length: 27 },
  { size: 'M', chest: 42, length: 28 },
  { size: 'L', chest: 44, length: 29 },
  { size: 'XL', chest: 46, length: 30 },
]

// Room (garment chest minus body chest) each fit needs
const EASE = { oversized: 6, relaxed: 3 }

/** Smallest size that leaves enough room for the chosen fit, or null if none fits. */
export function recommendSize(bodyChest, fit = 'oversized') {
  const chest = Number(bodyChest)
  if (!chest || chest < 20 || chest > 70) return null
  const hit = SIZE_CHART.find((row) => row.chest - chest >= EASE[fit])
  return hit ? hit.size : null
}
