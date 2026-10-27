import type { ArtItem, PackedSheet } from '../types'
import { getArtSourceSizeCm } from './units'

/** The weaker physical axis limits detail. Export DPI cannot invent source pixels. */
export function sourceResolutionDpi(art: ArtItem, defaultSide: number): number {
  const size = getArtSourceSizeCm(art, art.maxSideCmOverride ?? defaultSide)
  if (!(size.widthCm > 0 && size.heightCm > 0)) return 0
  return Math.min(art.trimmedWidthPx / size.widthCm, art.trimmedHeightPx / size.heightCm) * 2.54
}

export function auditQuantities(arts: Pick<ArtItem, 'id' | 'name' | 'quantity'>[], sheets: Pick<PackedSheet, 'placements'>[]) {
  const counts = new Map<string, number>()
  for (const sheet of sheets) for (const p of sheet.placements) counts.set(p.artId, (counts.get(p.artId) ?? 0) + 1)
  const ids = new Set(arts.map(a => a.id))
  const rows = arts.map(art => ({ id: art.id, name: art.name, requested: art.quantity, placed: counts.get(art.id) ?? 0 }))
  const unknown = [...counts].filter(([id]) => !ids.has(id))
  const valid = ids.size === arts.length && !unknown.length && rows.every(r => Number.isSafeInteger(r.requested) && r.requested >= 0 && r.requested === r.placed)
  return { valid, rows, unknown, requested: rows.reduce((n, r) => n + r.requested, 0), placed: [...counts.values()].reduce((n, count) => n + count, 0) }
}
