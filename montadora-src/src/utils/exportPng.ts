import type { PackedPlacement, PackedSheet } from '../types'
import {
  applyDrawSmoothing,
  getCropRect,
  renderSheetStrip,
  shiftPlacements,
} from './pack'
import { mmToPx, roundDistancePx } from './units'

/** Limites por arquivo: até 64 MiB de pixels RGBA, sem alocar a folha inteira. */
export const PNG_PART_LIMITS = { maxSide: 8192, maxPixels: 16 * 1024 * 1024 }

/** Substitui qualquer DPI do navegador, mantendo exatamente um pHYs no PNG. */
export function injectPhysChunk(png: ArrayBuffer, dpi: number): Blob {
  const bytes = new Uint8Array(png)
  if (bytes.length < 33 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    throw new Error('PNG inválido ao definir a resolução.')
  }
  const view = new DataView(png)
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8
  let hasHeader = false
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    if (end > bytes.length) throw new Error('PNG truncado ao definir a resolução.')
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (type !== 'pHYs') parts.push(bytes.subarray(offset, end))
    if (type === 'IHDR') {
      parts.push(buildPhysChunk(Math.round(dpi / 0.0254)))
      hasHeader = true
    }
    offset = end
  }
  if (!hasHeader) throw new Error('PNG sem dimensões ao definir a resolução.')
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let pos = 0
  for (const part of parts) { out.set(part, pos); pos += part.length }
  return new Blob([out], { type: 'image/png' })
}

function buildPhysChunk(ppm: number): Uint8Array {
  const data = new Uint8Array(9)
  const dv = new DataView(data.buffer)
  dv.setUint32(0, ppm)
  dv.setUint32(4, ppm)
  data[8] = 1

  const type = new TextEncoder().encode('pHYs')
  const crcInput = new Uint8Array(4 + 9)
  crcInput.set(type, 0)
  crcInput.set(data, 4)
  const crc = crc32(crcInput)

  const chunk = new Uint8Array(4 + 4 + 9 + 4)
  const cv = new DataView(chunk.buffer)
  cv.setUint32(0, 9)
  chunk.set(type, 4)
  chunk.set(data, 8)
  cv.setUint32(17, crc)
  return chunk
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function canvasToPngBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error('Falha ao gerar PNG'))
          return
        }
        void b.arrayBuffer().then(resolve, reject)
      },
      'image/png',
    )
  })
}

/**
 * Renderiza um tile (clipX, clipY, tileW, tileH) da folha.
 * Desenha só placements que intersectam o retângulo.
 */
function renderTile(
  sheetW: number,
  clipX: number,
  clipY: number,
  tileW: number,
  tileH: number,
  placements: PackedPlacement[],
): HTMLCanvasElement {
  // Se clipX===0 e tileW===sheetW, reutiliza strip otimizado
  if (clipX === 0 && tileW === sheetW) {
    return renderSheetStrip(sheetW, clipY, tileH, placements)
  }

  const canvas = document.createElement('canvas')
  canvas.width = tileW
  canvas.height = tileH
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('Canvas 2D indisponível (tile)')
  ctx.clearRect(0, 0, tileW, tileH)

  const clipRight = clipX + tileW
  const clipBottom = clipY + tileH

  for (const p of placements) {
    if (p.x + p.width <= clipX || p.x >= clipRight) continue
    if (p.y + p.height <= clipY || p.y >= clipBottom) continue

    ctx.save()
    if (p.rotated) {
      applyDrawSmoothing(ctx, p.source.width, p.source.height, p.height, p.width)
      ctx.translate(p.x - clipX + p.width, p.y - clipY)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(p.source, 0, 0, p.height, p.width)
    } else {
      applyDrawSmoothing(ctx, p.source.width, p.source.height, p.width, p.height)
      ctx.drawImage(p.source, p.x - clipX, p.y - clipY, p.width, p.height)
    }
    ctx.restore()
  }

  return canvas
}

export interface SheetExportOptions {
  /** Recortar ao bbox das peças + margem (mm). */
  cropEmpty?: boolean
  /** Margem ao redor do conteúdo no crop (mm). Default: config.marginMm via caller. */
  marginMm?: number
}

/**
 * Resolve dimensões e placements para export (com ou sem crop de vazios).
 */
export function resolveExportGeometry(
  sheet: PackedSheet,
  dpi: number,
  options?: SheetExportOptions,
): { widthPx: number; heightPx: number; placements: PackedPlacement[] } {
  const pls = sheet.placements
  if (!options?.cropEmpty || pls.length === 0) {
    return { widthPx: sheet.widthPx, heightPx: sheet.heightPx, placements: pls }
  }
  const marginMm = options.marginMm ?? 0
  const marginPx = roundDistancePx(mmToPx(marginMm, dpi))
  const crop = getCropRect(sheet.widthPx, sheet.heightPx, pls, marginPx)
  if (!crop) {
    return { widthPx: sheet.widthPx, heightPx: sheet.heightPx, placements: pls }
  }
  return {
    widthPx: crop.width,
    heightPx: crop.height,
    placements: shiftPlacements(pls, crop.x, crop.y),
  }
}

export interface PngPart {
  index: number
  row: number
  column: number
  x: number
  y: number
  widthPx: number
  heightPx: number
  cutsArtwork?: boolean
}

/** Planeja recortes sem criar canvases nem um buffer do tamanho total da folha. */
export function planPngParts(
  sheet: PackedSheet,
  dpi: number,
  options?: SheetExportOptions,
  limits = PNG_PART_LIMITS,
): PngPart[] {
  const { widthPx: width, heightPx: height } = resolveExportGeometry(sheet, dpi, options)
  if (![width, height, limits.maxSide, limits.maxPixels].every((n) => Number.isSafeInteger(n) && n > 0)) {
    throw new Error('Dimensões inválidas para dividir a folha em PNGs.')
  }
  const side = Math.floor(Math.sqrt(limits.maxPixels))
  const tileW = Math.min(width, limits.maxSide, Math.max(1, Math.floor(limits.maxPixels / Math.min(height, side))))
  const tileH = Math.min(height, limits.maxSide, Math.max(1, Math.floor(limits.maxPixels / tileW)))
  // Projeções dos retângulos: um corte no intervalo aberto atravessaria uma arte.
  const cutBefore = (start: number, limit: number, intervals: [number, number][]) => {
    const merged: [number, number][] = []
    for (const interval of intervals.sort((a, b) => a[0] - b[0])) {
      const last = merged.at(-1)
      if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1])
      else merged.push([...interval])
    }
    const crossing = merged.find(([a, b]) => a < limit && limit < b)
    const candidate = crossing ? Math.floor(crossing[0]) : limit
    return candidate > start ? candidate : limit
  }
  const geometry = resolveExportGeometry(sheet, dpi, options)
  const parts: PngPart[] = []
  for (let y = 0, row = 1; y < height; row++) {
    const bottom = cutBefore(y, Math.min(height, y + tileH), geometry.placements.map(p => [p.y, p.y + p.height]))
    const band = geometry.placements.filter(p => p.y < bottom && p.y + p.height > y)
    const widthLimit = Math.min(limits.maxSide, Math.floor(limits.maxPixels / (bottom - y)))
    for (let x = 0, column = 1; x < width; column++) {
      const right = cutBefore(x, Math.min(width, x + widthLimit), band.map(p => [p.x, p.x + p.width]))
      const cutsArtwork = band.some(p => p.x < right && p.x + p.width > x &&
        (p.x < x || p.x + p.width > right || p.y < y || p.y + p.height > bottom))
      parts.push({ index: parts.length, row, column, x, y, widthPx: right - x, heightPx: bottom - y, cutsArtwork })
      x = right
    }
    y = bottom
  }
  return parts
}

/** Renderiza somente uma parte, usando as fontes originais, sem reduzir DPI. */
export async function sheetPartToPngBlob(
  sheet: PackedSheet,
  dpi: number,
  part: PngPart,
  options?: SheetExportOptions,
): Promise<Blob> {
  const geometry = resolveExportGeometry(sheet, dpi, options)
  if (part.x < 0 || part.y < 0 || part.widthPx <= 0 || part.heightPx <= 0 ||
      part.x + part.widthPx > geometry.widthPx || part.y + part.heightPx > geometry.heightPx ||
      part.widthPx > PNG_PART_LIMITS.maxSide || part.heightPx > PNG_PART_LIMITS.maxSide ||
      part.widthPx * part.heightPx > PNG_PART_LIMITS.maxPixels) {
    throw new Error('Parte fora dos limites seguros da folha.')
  }
  const canvas = renderTile(geometry.widthPx, part.x, part.y, part.widthPx, part.heightPx, geometry.placements)
  try {
    if (canvas.width !== part.widthPx || canvas.height !== part.heightPx) throw new Error('O navegador não conseguiu criar esta parte da folha.')
    return injectPhysChunk(await canvasToPngBuffer(canvas), dpi)
  } finally {
    // Libera os pixels antes de processar a próxima parte.
    canvas.width = 0
    canvas.height = 0
  }
}

export async function sheetToPngBlob(
  sheet: PackedSheet,
  dpi: number,
  placements?: PackedPlacement[],
  options?: SheetExportOptions,
): Promise<Blob> {
  const target = placements ? { ...sheet, placements } : sheet
  const parts = planPngParts(target, dpi, options)
  if (parts.length !== 1) throw new Error(`A folha precisa ser dividida em ${parts.length} PNGs. Use a exportação em partes; o DPI será preservado.`)
  return sheetPartToPngBlob(target, dpi, parts[0], options)
}

/** Sanitiza nome do cliente para uso em nome de arquivo. */
export function sanitizeClientFilename(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return cleaned.slice(0, 80)
}

export function buildSheetFilename(
  sheet: PackedSheet,
  totalSheets: number,
  clientName?: string,
): string {
  const prefix = clientName ? sanitizeClientFilename(clientName) : ''
  const withPrefix = (base: string) => (prefix ? `${prefix}_${base}` : base)
  if (totalSheets === 1) {
    return withPrefix('gang.png')
  }
  return withPrefix(`folha-${String(sheet.index + 1).padStart(2, '0')}.png`)
}

export interface PngDownload {
  sheet: PackedSheet
  dpi: number
  part: PngPart
  filename: string
  options?: SheetExportOptions
}

export function planPngDownloads(sheets: PackedSheet[], dpi: number, options?: SheetExportOptions, clientName?: string, totalSheets = sheets.length): PngDownload[] {
  return sheets.flatMap((sheet) => {
    const base = buildSheetFilename(sheet, totalSheets, clientName)
    const parts = planPngParts(sheet, dpi, options)
    return parts.map((part) => ({ sheet, dpi, part, options, filename: parts.length === 1 ? base :
      `${base.replace(/\.png$/i, '')}-parte-${String(part.index + 1).padStart(2, '0')}-L${part.row}-C${part.column}-x${part.x}-y${part.y}.png` }))
  })
}

/** Um único Blob e URL de download por vez; sem ZIP nem bytes de outras partes retidos. */
export async function downloadPngPart(item: PngDownload): Promise<void> {
  const blob = await sheetPartToPngBlob(item.sheet, item.dpi, item.part, item.options)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = item.filename
  document.body.appendChild(anchor)
  try {
    anchor.click()
    // Dá tempo ao navegador para iniciar o download antes de liberar a URL.
    await new Promise((resolve) => window.setTimeout(resolve, 1000))
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
