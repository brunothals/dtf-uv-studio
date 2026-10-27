import type { ArtItem, PackedPlacement, PackedSheet, SheetConfig } from '../types'
import type { ArtPrintSize } from './pack'
import { cmToPx, mmToPx, roundPx, roundDistancePx } from './units'

interface Rect { x: number; y: number; width: number; height: number }
interface Piece { art: ArtItem; size: ArtPrintSize; order: number }
interface Bin { free: Rect[]; placements: PackedPlacement[] }

// Keep maximal free rectangles, including overlapping alternatives, after each placement.
function subtract(free: Rect[], used: Rect): Rect[] {
  const next: Rect[] = []
  for (const r of free) {
    const right = r.x + r.width, bottom = r.y + r.height
    if (used.x >= right || used.x + used.width <= r.x || used.y >= bottom || used.y + used.height <= r.y) {
      next.push(r); continue
    }
    if (used.x > r.x) next.push({ ...r, width: used.x - r.x })
    if (used.x + used.width < right) next.push({ ...r, x: used.x + used.width, width: right - used.x - used.width })
    if (used.y > r.y) next.push({ ...r, height: used.y - r.y })
    if (used.y + used.height < bottom) next.push({ ...r, y: used.y + used.height, height: bottom - used.y - used.height })
  }
  return next.filter((r, i) => !next.some((s, j) => i !== j && s.x <= r.x && s.y <= r.y &&
    s.x + s.width >= r.x + r.width && s.y + s.height >= r.y + r.height &&
    (j < i || s.x !== r.x || s.y !== r.y || s.width !== r.width || s.height !== r.height)))
}

/** Bounded deterministic multi-start MaxRects. Gaps stay on their physical axes even after rotation. */
export function optimizePacking(
  arts: ArtItem[], sizes: ArtPrintSize[], config: SheetConfig, baseline: PackedSheet[],
): PackedSheet[] {
  const width = roundPx(cmToPx(config.widthCm, config.dpi))
  const height = roundPx(cmToPx(config.heightCm, config.dpi))
  const margin = roundDistancePx(mmToPx(config.marginMm, config.dpi))
  const gx = roundDistancePx(mmToPx(config.gapXMm ?? config.gapMm, config.dpi))
  const gy = roundDistancePx(mmToPx(config.gapYMm ?? config.gapMm, config.dpi))
  const pieces: Piece[] = arts.flatMap((art, i) => Array.from({ length: Math.max(0, Math.floor(art.quantity) || 0) },
    (_, order) => ({ art, size: sizes[i], order })))
  if (!pieces.length) return []
  const orders = [
    (p: Piece) => p.size.widthPx * p.size.heightPx,
    (p: Piece) => Math.max(p.size.widthPx, p.size.heightPx),
    (p: Piece) => p.size.heightPx,
  ].map(score => [...pieces].sort((a, b) => score(b) - score(a) || a.art.id.localeCompare(b.art.id) || a.order - b.order))

  function run(ordered: Piece[], h: number, areaFit: boolean): PackedSheet[] {
    const bins: Bin[] = []
    for (const { art, size } of ordered) {
      let selected: { bin: Bin; rect: Rect; rotated: boolean; w: number; h: number; score: number[] } | undefined
      for (let bi = 0; bi <= bins.length; bi++) {
        const bin = bins[bi] ?? { free: [{ x: margin, y: margin, width: width - 2 * margin + gx, height: h - 2 * margin + gy }], placements: [] }
        for (const r of bin.free) for (const turn of config.optimizedAutoRotation === false ? [false] : [false, true]) {
          const w = turn ? size.heightPx : size.widthPx, ph = turn ? size.widthPx : size.heightPx
          const rw = w + gx, rh = ph + gy
          if (rw > r.width || rh > r.height) continue
          const short = Math.min(r.width - rw, r.height - rh)
          const score = areaFit ? [r.width * r.height - rw * rh, short, r.y, r.x] : [short, Math.max(r.width - rw, r.height - rh), r.y, r.x]
          const better = !selected || score.some((v, i) => v < selected!.score[i] && score.slice(0, i).every((n, j) => n === selected!.score[j]))
          if (better) selected = { bin, rect: { x: r.x, y: r.y, width: rw, height: rh }, rotated: turn !== size.rotated, w, h: ph, score }
        }
        // Prefer all already-open sheets to creating another one.
        if (selected) break
      }
      if (!selected) return []
      const { bin, rect } = selected
      if (!bins.includes(bin)) bins.push(bin)
      bin.free = subtract(bin.free, rect)
      bin.placements.push({ artId: art.id, name: art.name, source: art.trimmedCanvas,
        x: rect.x, y: rect.y, width: selected.w, height: selected.h, rotated: selected.rotated })
    }
    return bins.map((bin, index) => ({ index, widthPx: width, heightPx: h, placements: bin.placements, previewUrl: '' }))
  }
  const length = (sheets: PackedSheet[]) => sheets.reduce((n, s) => n + Math.max(0, ...s.placements.map(p => p.y + p.height)) + margin, 0)
  const complete = (s: PackedSheet[]) => s.length > 0 && s.reduce((n, b) => n + b.placements.length, 0) === pieces.length
  let best = complete(baseline) ? baseline : []
  const consider = (candidate: PackedSheet[]) => {
    if (complete(candidate) && (!best.length || candidate.length < best.length ||
      (candidate.length === best.length && length(candidate) < length(best)))) best = candidate
  }
  // Large batches use fewer starts to keep the browser responsive.
  for (const order of orders.slice(0, pieces.length > 600 ? 1 : 3)) {
    for (const areaFit of pieces.length > 600 ? [false] : [false, true]) {
      consider(run(order, height, areaFit))
      if (config.sheetGrowMode !== 'auto_height' || best.length !== 1) continue
      let low = Math.max(1, Math.ceil(pieces.reduce((n, p) => n + p.size.widthPx * p.size.heightPx, 0) / Math.max(1, width - 2 * margin)) + 2 * margin)
      let high = Math.min(height, length(best))
      // Retain the best complete layout even if heuristic feasibility is non-monotonic.
      for (let step = 0; step < (pieces.length > 600 ? 6 : 12) && low < high; step++) {
        const mid = Math.floor((low + high) / 2)
        const candidate = run(order, mid, areaFit)
        if (complete(candidate) && candidate.length === 1) { consider(candidate); high = mid }
        else low = mid + 1
      }
    }
  }
  return best
}
