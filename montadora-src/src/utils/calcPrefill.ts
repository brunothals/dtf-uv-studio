import { MAX_AUTO_HEIGHT_CM, type ArtItem } from '../types'
import { resizeArt } from './artEditing'

/** Medida e quantidade de uma arte calculada na página da calculadora. */
export interface CalcPrefillArt {
  widthCm: number
  heightCm: number
  quantity: number
  color?: string
}

/** Folha calculada recebida pela URL (`montadora/?origem=calculadora&w=..&h=..&esp=..&arte=LxAxQ`). */
export interface CalcPrefill {
  widthCm: number
  heightCm: number
  /** Espaçamento entre artes em mm (a calculadora envia cm). null = manter o padrão. */
  gapMm: number | null
  arts: CalcPrefillArt[]
}

const MAX_PREFILL_ARTS = 50
const ART_RE = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+)$/

function readNumber(v: string | null): number | null {
  if (v == null || v.trim() === '') return null
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Lê os parâmetros da calculadora; ignora valores inválidos e retorna null sem a origem esperada. */
export function parseCalcPrefill(search: string): CalcPrefill | null {
  const q = new URLSearchParams(search)
  if (q.get('origem') !== 'calculadora') return null
  const widthCm = readNumber(q.get('w'))
  const heightCm = readNumber(q.get('h'))
  const esp = readNumber(q.get('esp'))
  if (widthCm == null || heightCm == null || widthCm <= 0 || heightCm <= 0 || widthCm > 500 || heightCm > MAX_AUTO_HEIGHT_CM) return null
  const colors = q.getAll('cor')
  const arts = q.getAll('arte').slice(0, MAX_PREFILL_ARTS).flatMap((raw, index) => {
    const m = ART_RE.exec(raw.trim())
    if (!m) return []
    const art = { widthCm: Number(m[1]), heightCm: Number(m[2]), quantity: Number(m[3]), color: colors[index]?.slice(0, 120) }
    return art.widthCm > 0 && art.heightCm > 0 && art.quantity > 0 && art.quantity <= 100000 ? [art] : []
  })
  return {
    widthCm,
    heightCm,
    // 0 é válido: mesma regra da calculadora e da montadora.
    gapMm: esp != null && esp >= 0 && esp <= 50 ? Math.round(esp * 1000) / 100 : null,
    arts,
  }
}

/**
 * Aplica a medida calculada a uma arte importada sem deformar a imagem:
 * a arte fica contida no retângulo (na orientação da imagem) e recebe a quantidade calculada.
 */
export function fitArtToBox(art: ArtItem, box: CalcPrefillArt, defaultSide: number): ArtItem {
  const ratio = art.trimmedWidthPx / art.trimmedHeightPx
  let bw = box.widthCm
  let bh = box.heightCm
  if ((ratio >= 1) !== (bw >= bh)) [bw, bh] = [bh, bw]
  const axis: 'width' | 'height' = ratio >= bw / bh ? 'width' : 'height'
  const sized = resizeArt({ ...art, lockAspect: true, rotate90: false }, axis, axis === 'width' ? bw : bh, defaultSide)
  return { ...sized, quantity: box.quantity, color: box.color }
}
