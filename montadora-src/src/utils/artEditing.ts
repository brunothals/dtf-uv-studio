import type { ArtItem } from '../types'
import { getArtSourceSizeCm } from './units'

/** Edita a medida vista na folha; rotação só troca eixos, nunca a escala. */
export function resizeArt(art: ArtItem, axis: 'width' | 'height', value: number, defaultSide: number): ArtItem {
  if (!Number.isFinite(value) || value <= 0) return art
  const size = getArtSourceSizeCm(art, art.maxSideCmOverride ?? defaultSide)
  const sourceAxis = art.rotate90 ? (axis === 'width' ? 'height' : 'width') : axis
  let width = size.widthCm, height = size.heightCm
  if (sourceAxis === 'width') {
    width = value
    if (art.lockAspect !== false) height = value * art.trimmedHeightPx / art.trimmedWidthPx
  } else {
    height = value
    if (art.lockAspect !== false) width = value * art.trimmedWidthPx / art.trimmedHeightPx
  }
  return { ...art, widthCmOverride: width, heightCmOverride: height, maxSideCmOverride: Math.max(width, height) }
}
