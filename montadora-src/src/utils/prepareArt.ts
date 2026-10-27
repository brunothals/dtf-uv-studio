import type { ArtPreparation } from '../types'

export const MAX_PREPARATION_PIXELS = 16 * 1024 * 1024

/** Eight-connected components. Keep the largest component even on an all-dot design. */
export function cleanIsolatedPixels(data: Uint8ClampedArray, width: number, height: number, maxArea: number): number {
  const total = width * height, visited = new Uint8Array(total), queue = new Uint32Array(total)
  let tail = 0, largestStart = 0, largestSize = 0
  const threshold = Math.max(1, Math.min(100, Math.floor(maxArea) || 1))
  for (let i = 0; i < total; i++) {
    if (visited[i] || !data[i * 4 + 3]) continue
    const start = tail
    visited[i] = 1; queue[tail++] = i
    for (let head = start; head < tail; head++) {
      const pixel = queue[head], x = pixel % width, y = Math.floor(pixel / width)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const n = ny * width + nx
        if (!visited[n] && data[n * 4 + 3]) { visited[n] = 1; queue[tail++] = n }
      }
    }
    const size = tail - start
    if (size > largestSize) { largestStart = start; largestSize = size }
    if (size <= threshold) for (let p = start; p < tail; p++) visited[queue[p]] = 2
  }
  for (let p = largestStart; p < largestStart + largestSize; p++) visited[queue[p]] = 1
  let removed = 0
  for (let i = 0; i < total; i++) if (visited[i] === 2) {
    data.fill(0, i * 4, i * 4 + 4); removed++
  }
  return removed
}

/** Grow alpha with a disk, without compositing dark/white backgrounds or clipping edge ink. */
export function thickenPixels(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  const r = Math.max(1, Math.min(3, Math.floor(radius) || 1))
  const w = width + r * 2, h = height + r * 2, output = new Uint8ClampedArray(w * h * 4)
  const offsets: [number, number][] = []
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) offsets.push([x, y])
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 4, alpha = data[src + 3]
    if (!alpha) continue
    for (const [dx, dy] of offsets) {
      const dst = ((y + r + dy) * w + x + r + dx) * 4
      if (alpha > output[dst + 3]) {
        output[dst] = data[src]; output[dst + 1] = data[src + 1]; output[dst + 2] = data[src + 2]; output[dst + 3] = alpha
      }
    }
  }
  // Preserve existing ink colors; only alpha and formerly transparent pixels grow.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 4, dst = ((y + r) * w + x + r) * 4
    if (data[src + 3]) output.set(data.subarray(src, src + 3), dst)
  }
  let added = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!output[(y * w + x) * 4 + 3]) continue
    const ox = x - r, oy = y - r
    if (ox < 0 || oy < 0 || ox >= width || oy >= height || !data[(oy * width + ox) * 4 + 3]) added++
  }
  return { data: output, width: w, height: h, addedPixels: added }
}

/** Always start from the original. No destructive edits or cumulative thickening. */
export function prepareArt(source: HTMLCanvasElement, settings?: ArtPreparation) {
  const stats = { removedPixels: 0, addedPixels: 0 }
  if (!settings || (!settings.cleanSpecks && !settings.thicken)) return { canvas: source, stats }
  if (source.width * source.height > MAX_PREPARATION_PIXELS) {
    throw new Error('Preparação limitada a 16 megapixels por arte. O original foi preservado; use uma arte menor ou mantenha os ajustes desligados.')
  }
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D indisponível para preparar a arte.')
  const image = context.getImageData(0, 0, source.width, source.height)
  if (settings.cleanSpecks) stats.removedPixels = cleanIsolatedPixels(image.data, source.width, source.height, settings.maxSpeckPixels)
  const pixels = settings.thicken ? thickenPixels(image.data, source.width, source.height, settings.radiusPx)
    : { data: image.data, width: source.width, height: source.height, addedPixels: 0 }
  stats.addedPixels = pixels.addedPixels
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width; canvas.height = pixels.height
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width !== pixels.width || canvas.height !== pixels.height) throw new Error('Memória insuficiente para preparar esta arte; original preservado.')
  const result = ctx.createImageData(pixels.width, pixels.height)
  result.data.set(pixels.data); ctx.putImageData(result, 0, 0)
  return { canvas, stats }
}
