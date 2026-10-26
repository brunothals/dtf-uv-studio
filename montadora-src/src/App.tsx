import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import {
  DEFAULT_CONFIG,
  MAX_AUTO_HEIGHT_CM,
  type ArtItem,
  type PackedSheet,
  type PackMode,
  type SheetConfig,
} from './types'
import {
  applyTrim,
  IMPORT_WARN_MAX_SIDE_PX,
  loadPngAsCanvas,
  makeThumbnailDataUrl,
} from './utils/trim'
import { buildPreviewUrl, getArtPrintSize, packArts, scalePackedSheet } from './utils/pack'
import {
  fillLeftoverQuantities,
  maxEqualQtyOnOneSheet,
  maxQtyOneArtOnOneSheet,
} from './utils/fillSheet'
import {
  planPngDownloads,
  planPngParts,
  downloadPngPart,
  type PngDownload,
  type PngPart,
  resolveExportGeometry,
} from './utils/exportPng'
import { isPdfFile, loadPdfAsCanvases } from './utils/pdfImport'
import { cmToPx, computeNativeExportDpi, resolveExportDpi, roundPx } from './utils/units'
import { resizeArt } from './utils/artEditing'
import './App.css'

/** DPI máximo para packing/preview ao vivo (export reempacota no DPI escolhido). */
const PREVIEW_DPI_CAP = 150
/** Presets de qualidade do PNG exportado (preview permanece ≤ PREVIEW_DPI_CAP). */
const EXPORT_DPI_HIGH = 300
const EXPORT_DPI_FAST = 150
/** Debounce do packing ao vivo (ms). */
const PACK_DEBOUNCE_MS = 320
/** Quantas folhas geram previewUrl de uma vez (resto sob demanda). */
const MAX_LIVE_PREVIEW_SHEETS = 6

const LENGTH_OPTIONS: [string, string][] = [
  ['21', '21 cm'],
  ['42', '42 cm'],
  ['50', '50 cm'],
  ['100', '100 cm'],
  ['auto', 'Completar'],
  ['custom', 'Personalizado'],
]

/** Espaço guardado em mm, exibido em cm (0,3 cm = 3 mm). */
function mmToCmField(mm: number): number {
  return Math.round((mm / 10) * 100) / 100
}
function cmFieldToMm(v: string): number {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 100 : 0
}

type ExportQualityPreset = 'native' | 'high' | 'fast' | 'custom'

function getExportQuality(config: SheetConfig): ExportQualityPreset {
  if (config.useNativeDpi !== false) return 'native'
  if (config.dpi === EXPORT_DPI_HIGH) return 'high'
  if (config.dpi === EXPORT_DPI_FAST) return 'fast'
  return 'custom'
}

function applyExportQuality(
  config: SheetConfig,
  quality: ExportQualityPreset,
  nativeDpiFallback: number,
): SheetConfig {
  switch (quality) {
    case 'native':
      return { ...config, useNativeDpi: true }
    case 'high':
      return { ...config, useNativeDpi: false, dpi: EXPORT_DPI_HIGH }
    case 'fast':
      return { ...config, useNativeDpi: false, dpi: EXPORT_DPI_FAST }
    case 'custom':
      return {
        ...config,
        useNativeDpi: false,
        dpi:
          config.useNativeDpi !== false
            ? Math.max(72, Math.round(nativeDpiFallback) || EXPORT_DPI_HIGH)
            : config.dpi,
      }
  }
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function buildArtItem(
  id: string,
  name: string,
  originalCanvas: HTMLCanvasElement,
  originalWidthPx: number,
  originalHeightPx: number,
  trimEnabled: boolean,
  alphaThreshold: number,
  quantity = 1,
  maxSideCmOverride: number | null = null,
  rotate90 = false,
): ArtItem {
  const trimmed = applyTrim(originalCanvas, trimEnabled, alphaThreshold)
  return {
    id,
    name,
    originalCanvas,
    originalWidthPx,
    originalHeightPx,
    trimmedCanvas: trimmed.canvas,
    trimmedWidthPx: trimmed.width,
    trimmedHeightPx: trimmed.height,
    // Thumbnail pequeno — nunca toDataURL da arte em resolução plena (OOM)
    thumbnailUrl: makeThumbnailDataUrl(trimmed.canvas, trimmed.width, trimmed.height),
    quantity,
    maxSideCmOverride,
    rotate90,
  }
}

function artDupKey(name: string, size: number): string {
  return `${name.toLowerCase()}::${size}`
}

function LazySheetPreview({
  sheet,
  alt,
}: {
  sheet: PackedSheet
  alt: string
}) {
  const [url, setUrl] = useState(sheet.previewUrl)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setUrl(sheet.previewUrl)
    setFailed(false)
  }, [sheet])

  useEffect(() => {
    if (url || failed) return
    let cancelled = false
    // Gera preview sob demanda (fora do packing em lote)
    const t = window.setTimeout(() => {
      try {
        const next = buildPreviewUrl(sheet.widthPx, sheet.heightPx, sheet.placements)
        if (!cancelled) {
          if (next) setUrl(next)
          else setFailed(true)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }, 50)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [url, failed, sheet])

  if (url) {
    return <img src={url} alt={alt} />
  }
  if (failed) {
    return (
      <p className="empty">Preview indisponível (folha muito grande ou falta de memória)</p>
    )
  }
  return <p className="empty">Gerando preview…</p>
}

function MeasurementInput({ value, label, onValue }: { value: number; label: string; onValue: (value: string) => void }) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  return <input type="number" min={0.001} step={0.1} aria-label={label}
    value={editing ? draft : Number(value.toFixed(4))}
    onFocus={() => { setDraft(String(Number(value.toFixed(4)))); setEditing(true) }}
    onChange={event => { setDraft(event.target.value); onValue(event.target.value) }}
    onBlur={() => setEditing(false)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
}

function PreviewSurface({ sheet, parts, zoom, showCuts, organized, focusedArt, onSelect }: {
  sheet: PackedSheet; parts: PngPart[]; zoom: number; showCuts: boolean; organized: boolean; focusedArt: string | null
  onSelect: (sheet: PackedSheet, x: number, y: number, element: HTMLElement, multiple?: boolean) => void
}) {
  const rowMap = new Map<number, typeof sheet.placements>()
  for (const p of sheet.placements) {
    const row = rowMap.get(p.y)
    if (row) row.push(p)
    else rowMap.set(p.y, [p])
  }
  const rows = [...rowMap.entries()].sort(([a], [b]) => a - b).map(([y, pieces]) => ({ y, pieces: pieces.sort((a, b) => a.x - b.x) }))
  return <div className="preview-stage" style={{ width: `${zoom * 100}%`, aspectRatio: `${sheet.widthPx} / ${sheet.heightPx}` }}
    role="button" tabIndex={0} aria-label={`Selecionar arte na prévia da folha ${sheet.index + 1}`}
    onClick={event => onSelect(sheet, event.clientX, event.clientY, event.currentTarget, event.ctrlKey || event.metaKey)}
    onKeyDown={event => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); const p = sheet.placements[0]; if (!p) return; const box = event.currentTarget.getBoundingClientRect(); onSelect(sheet, box.left + (p.x + p.width / 2) * box.width / sheet.widthPx, box.top + (p.y + p.height / 2) * box.height / sheet.heightPx, event.currentTarget) }}>
    <LazySheetPreview sheet={sheet} alt={`Folha ${sheet.index + 1} — pré-visualização`} />
    <svg className="preview-overlay" viewBox={`0 0 ${sheet.widthPx} ${sheet.heightPx}`} aria-hidden="true">
      {showCuts && organized && <g data-testid="row-cut-guides" className="row-cut-guides">{rows.map((row, i) => {
        const bottom = Math.max(...row.pieces.map(p => p.y + p.height))
        return <g key={row.y}>
          {i < rows.length - 1 && <line x1={0} x2={sheet.widthPx} y1={(bottom + rows[i + 1].y) / 2} y2={(bottom + rows[i + 1].y) / 2} />}
          {row.pieces.slice(0, -1).map((p, n) => <line key={n} x1={(p.x + p.width + row.pieces[n + 1].x) / 2} x2={(p.x + p.width + row.pieces[n + 1].x) / 2} y1={row.y} y2={bottom} />)}
        </g>
      })}</g>}
      {showCuts && parts.length > 1 && <g data-testid="part-guides">{parts.map(part => <rect key={part.index}
        x={part.x} y={part.y} width={part.widthPx} height={part.heightPx} className={part.cutsArtwork ? 'cut-warning' : 'cut-guide'} />)}</g>}
      {sheet.placements.filter(p => p.artId === focusedArt).map((p, i) => <rect key={i} data-testid="preview-selection" x={p.x} y={p.y} width={p.width} height={p.height} className="selected-outline" />)}
    </svg>
  </div>
}

export default function App() {

  const [zoom, setZoom] = useState(1)
  const [showCuts, setShowCuts] = useState(true)
  const [focusedArt, setFocusedArt] = useState<string | null>(null)
  const [undoRemoval, setUndoRemoval] = useState<{ art: ArtItem; index: number; selected: boolean }[]>([])
  const [batchQuantity, setBatchQuantity] = useState(1)
  const [batchWidth, setBatchWidth] = useState(5)
  const [batchGroup, setBatchGroup] = useState('')
  const [pngDownloads, setPngDownloads] = useState<PngDownload[]>([])
  const cancelExportRef = useRef(false)
  const [previewBackground, setPreviewBackground] = useState('dark')
  const [previewColor, setPreviewColor] = useState('#243047')
  const [layoutInput, setLayoutInput] = useState<{ arts: ArtItem[]; config: SheetConfig } | null>(null)
  const [config, setConfig] = useState<SheetConfig>({ ...DEFAULT_CONFIG })
  /** Comprimento: '21'|'42'|'50'|'100'|'auto' (completar)|'custom' */
  const [widthChoice, setWidthChoice] = useState('29')
  const [lengthChoice, setLengthChoice] = useState<string>('42')
  const [arts, setArts] = useState<ArtItem[]>([])
  const [sheets, setSheets] = useState<PackedSheet[]>([])
  const [packErrors, setPackErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [exporting, setExporting] = useState(false)
  const [removePdfWhite, setRemovePdfWhite] = useState(false)
  const [pdfImportDpi, setPdfImportDpi] = useState(600)
  /** Checkbox por arte (default marcado ao importar) — usado em Dividir iguais */
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  /** Prefixo opcional nos arquivos exportados */
  const [clientName, setClientName] = useState('')
  /** Pular PNGs com mesmo nome+tamanho já na lista */
  const skipDuplicateNames = false
  /** Erro fatal de packing/preview (canvas OOM etc.) */
  const [packFatalError, setPackFatalError] = useState<string | null>(null)

  useEffect(() => {
    if (!undoRemoval.length) return
    const timer = window.setTimeout(() => setUndoRemoval([]), 60000)
    return () => window.clearTimeout(timer)
  }, [undoRemoval])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  /** artId → chave nome::tamanho para skip de duplicatas */
  const artDupKeyByIdRef = useRef<Map<string, string>>(new Map())

  // Evita re-trim na montagem inicial / só reprocessa quando trim ou limiar mudam
  const trimKeyRef = useRef(`${config.trimEnabled}:${config.alphaThreshold}`)

  useEffect(() => {
    const el = folderInputRef.current
    if (el) {
      el.setAttribute('webkitdirectory', '')
      el.setAttribute('directory', '')
    }
  }, [])

  // Novas artes entram selecionadas; remove ids órfãos
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = { ...prev }
      let changed = false
      const live = new Set(arts.map((a) => a.id))
      for (const a of arts) {
        if (!(a.id in next)) {
          next[a.id] = true
          changed = true
        }
      }
      for (const id of Object.keys(next)) {
        if (!live.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [arts])

  const updateConfig = useCallback(<K extends keyof SheetConfig>(key: K, value: SheetConfig[K]) => {
    setConfig((c) => ({ ...c, [key]: value }))
  }, [])

  /** Comprimento da folha: preset fixo, completar (sob medida) ou personalizado. */
  const onLengthChange = (v: string) => {
    setLengthChoice(v)
    if (v === 'auto') {
      setGrowMode('auto_height')
      return
    }
    setConfig((c) => ({
      ...c,
      sheetGrowMode: 'fixed',
      heightCm: v === 'custom' ? c.heightCm : Number(v),
    }))
  }

  // Reprocessar corte sem reimportar quando trim ou sensibilidade mudam
  useEffect(() => {
    const key = `${config.trimEnabled}:${config.alphaThreshold}`
    if (key === trimKeyRef.current) return
    trimKeyRef.current = key

    setArts((prev) => {
      if (prev.length === 0) return prev
      return prev.map((art) => { const next = { ...art, ...buildArtItem(
          art.id,
          art.name,
          art.originalCanvas,
          art.originalWidthPx,
          art.originalHeightPx,
          config.trimEnabled,
          config.alphaThreshold,
          art.quantity,
          art.maxSideCmOverride,
          art.rotate90,
        ) }; return art.lockAspect !== false && art.widthCmOverride != null ? resizeArt(next, 'width', getArtPrintSize(art, config).widthCm, config.maxSideCm) : next
      })
    })
  }, [config.trimEnabled, config.alphaThreshold])

  const importFiles = async (fileList: FileList | File[]) => {
    const all = Array.from(fileList)
    const files = all.filter(
      (f) =>
        f.size > 0 &&
        (f.type === 'image/png' || f.name.toLowerCase().endsWith('.png') || isPdfFile(f)),
    )
    const skippedNonPng = all.length - files.length
    if (files.length === 0) {
      setStatus(
        skippedNonPng > 0
          ? `Nenhum PNG/PDF válido (ignorados ${skippedNonPng} outros/vazios).`
          : 'Nenhum PNG ou PDF encontrado.',
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (folderInputRef.current) folderInputRef.current.value = ''
      return
    }
    setLoading(true)
    setStatus(`Processando ${files.length} arquivo(s)…`)
    const next: ArtItem[] = []
    const failures: string[] = []
    const largeWarns: string[] = []
    let anyCropped = false
    let skippedDup = 0
    let pdfPages = 0
    let pdfCapped = 0

    // Chaves já existentes + do lote atual
    const seen = new Set<string>()
    if (skipDuplicateNames) {
      for (const k of artDupKeyByIdRef.current.values()) seen.add(k)
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setStatus(`Processando ${i + 1}/${files.length}: ${file.name}`)
      const key = artDupKey(file.name, file.size)
      if (skipDuplicateNames && seen.has(key)) {
        skippedDup++
        continue
      }
      if (isPdfFile(file)) {
        try {
          const { pages, failures: pf } = await loadPdfAsCanvases(
            file,
            pdfImportDpi,
            (pg, total) =>
              setStatus(`Processando ${i + 1}/${files.length}: ${file.name} (página ${pg}/${total})`),
            { removeWhiteBackground: removePdfWhite },
          )
          failures.push(...pf)
          if (pages.length === 0 && pf.length === 0) {
            failures.push(`${file.name}: PDF sem páginas`)
          }
          for (const pg of pages) {
            try {
            const id = uid()
            const art = buildArtItem(
              id,
              pg.name,
              pg.canvas,
              pg.width,
              pg.height,
              config.trimEnabled,
              config.alphaThreshold,
            )
            if (
              config.trimEnabled &&
              (art.trimmedWidthPx !== art.originalWidthPx ||
                art.trimmedHeightPx !== art.originalHeightPx)
            ) {
              anyCropped = true
            }
            if (pg.capped) pdfCapped++
            pdfPages++
            next.push(art)
            artDupKeyByIdRef.current.set(id, `${key}::p${pg.name}`)
            } catch (e) { failures.push(`${pg.name}: ${e instanceof Error ? e.message : 'falha nesta página'}`) }
          }
          if (pages.length > 0) seen.add(key)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          failures.push(`${file.name}: ${msg}`)
          console.warn('Falha ao importar PDF', file.name, e)
        }
        continue
      }
      try {
        const loaded = await loadPngAsCanvas(file)
        if (loaded.warnLarge) {
          largeWarns.push(
            `${loaded.name} (${loaded.width}×${loaded.height} px > ${IMPORT_WARN_MAX_SIDE_PX})`,
          )
        }
        const id = uid()
        const art = buildArtItem(
          id,
          loaded.name,
          loaded.canvas,
          loaded.width,
          loaded.height,
          config.trimEnabled,
          config.alphaThreshold,
        )
        if (
          config.trimEnabled &&
          (art.trimmedWidthPx !== art.originalWidthPx ||
            art.trimmedHeightPx !== art.originalHeightPx)
        ) {
          anyCropped = true
        }
        next.push(art)
        seen.add(key)
        artDupKeyByIdRef.current.set(id, key)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        failures.push(`${file.name}: ${msg}`)
        console.warn('Falha ao importar', file.name, e)
      }
    }

    if (next.length > 0) {
      setArts((prev) => [...prev, ...next])
      trimKeyRef.current = `${config.trimEnabled}:${config.alphaThreshold}`
    }

    const parts: string[] = []
    parts.push(`${next.length} ok`)
    if (failures.length > 0) {
      const detail = failures.slice(0, 3).join('; ')
      const more = failures.length > 3 ? ` (+${failures.length - 3})` : ''
      parts.push(`${failures.length} falharam: ${detail}${more}`)
    }
    if (skippedDup > 0) parts.push(`${skippedDup} duplicata(s) ignorada(s)`)
    if (skippedNonPng > 0) parts.push(`${skippedNonPng} não-PNG/PDF/vazio(s)`)
    if (pdfPages > 0) {
      parts.push(
        `${pdfPages} página(s) de PDF a ${pdfImportDpi} DPI${removePdfWhite ? ' · branco externo removido' : ' · cores originais preservadas'}`,
      )
    }
    if (pdfCapped > 0) parts.push(`${pdfCapped} página(s) reduzida(s) pelo limite de memória`)
    if (anyCropped) parts.push('bordas transparentes cortadas')
    if (largeWarns.length > 0) {
      parts.push(
        `aviso: ${largeWarns.length} arte(s) > ${IMPORT_WARN_MAX_SIDE_PX}px (qualidade de export mantida)`,
      )
    }
    setStatus(parts.join(' · '))
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const removeArts = (ids: Set<string>) => {
    const removed = arts.flatMap((art, index) => ids.has(art.id) ? [{ art, index, selected: !!selectedIds[art.id] }] : [])
    setUndoRemoval(removed)
    ids.forEach(id => artDupKeyByIdRef.current.delete(id))
    setArts(prev => prev.filter(art => !ids.has(art.id)))
    setStatus(`${removed.length} arte(s) excluída(s). Você pode desfazer.`)
  }
  const removeArt = (id: string) => removeArts(new Set([id]))
  const removeSelectedArts = () => removeArts(new Set(arts.filter(a => selectedIds[a.id]).map(a => a.id)))
  const clearArts = () => removeArts(new Set(arts.map(a => a.id)))
  const restoreArts = () => {
    setArts(prev => {
      const next = [...prev]
      for (const item of undoRemoval) if (!next.some(a => a.id === item.art.id)) next.splice(Math.min(item.index, next.length), 0, item.art)
      return next
    })
    setSelectedIds(prev => ({ ...prev, ...Object.fromEntries(undoRemoval.map(item => [item.art.id, item.selected])) }))
    setUndoRemoval([])
    setStatus('Artes restauradas.')
  }
  const duplicateArt = (art: ArtItem) => {
    const nextId = uid()
    let n = 2
    const stem = art.name.replace(/ — variação \d+$/, '')
    while (arts.some(a => a.name === `${stem} — variação ${n}`)) n++
    setArts(prev => [...prev, { ...art, id: nextId, name: `${stem} — variação ${n}` }])
    setFocusedArt(nextId)
  }
  const setArtMeasurement = (id: string, axis: 'width' | 'height', value: string) => {
    setArts(prev => prev.map(art => art.id === id ? resizeArt(art, axis, Number(value), config.maxSideCm) : art))
  }
  const applyToSelected = (operation: 'quantity' | 'width' | 'group') => {
    setArts(prev => prev.map(art => !selectedIds[art.id] ? art : operation === 'quantity'
      ? { ...art, quantity: Math.max(0, Math.floor(batchQuantity) || 0) }
      : operation === 'group' ? { ...art, groupName: batchGroup.trim() } : resizeArt(art, 'width', batchWidth, config.maxSideCm)))
  }
  const selectFromPreview = (sheet: PackedSheet, clientX: number, clientY: number, element: HTMLElement, multiple = false) => {
    const box = element.getBoundingClientRect()
    const x = (clientX - box.left) * sheet.widthPx / box.width
    const y = (clientY - box.top) * sheet.heightPx / box.height
    const placement = sheet.placements.find(p => x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height)
    if (!placement) return
    setFocusedArt(placement.artId)
    setSelectedIds(prev => multiple ? { ...prev, [placement.artId]: !prev[placement.artId] } : { [placement.artId]: true })
    document.getElementById(`art-${placement.artId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const selectAllArts = () => {
    setSelectedIds(Object.fromEntries(arts.map((a) => [a.id, true])))
  }

  const clearSelection = () => {
    setSelectedIds(Object.fromEntries(arts.map((a) => [a.id, false])))
  }

  const handleEncherFolha = (id: string) => {
    const art = arts.find((a) => a.id === id)
    if (!art) return
    const dpi = resolveExportDpi(arts, config)
    const q = maxQtyOneArtOnOneSheet(art, { ...config, dpi })
    setArts((prev) => prev.map((a) => (a.id === id ? { ...a, quantity: q } : a)))
    setStatus(
      q > 0
        ? `Encher folha: "${art.name}" → ${q} peça(s) em 1 folha.`
        : `Encher folha: "${art.name}" não cabe na folha com o tamanho atual.`,
    )
  }

  const handleDividirIguais = () => {
    const selected = arts.filter((a) => selectedIds[a.id])
    const dpi = resolveExportDpi(arts, config)
    const cfg = { ...config, dpi }
    const fitting = selected.filter((a) => !getArtPrintSize(a, cfg).error)
    if (fitting.length === 0) {
      setStatus('Dividir iguais: selecione ao menos uma arte que caiba na folha.')
      return
    }
    const q = maxEqualQtyOnOneSheet(fitting, cfg)
    const ids = new Set(fitting.map((a) => a.id))
    setArts((prev) => prev.map((a) => (ids.has(a.id) ? { ...a, quantity: q } : a)))
    if (fitting.length === 1) {
      setStatus(
        q > 0
          ? `Dividir iguais: 1 arte → ${q} peça(s) (mesmo que Encher folha).`
          : 'Dividir iguais: a arte selecionada não cabe na folha.',
      )
    } else {
      setStatus(
        q > 0
          ? `Dividir iguais: ${fitting.length} artes → ${q} cada (1 folha).`
          : 'Dividir iguais: não cabe 1 de cada na mesma folha — reduza o tamanho ou a seleção.',
      )
    }
  }

  const handlePreencherSobras = () => {
    const dpi = resolveExportDpi(arts, config)
    const cfg = { ...config, dpi }
    const hasOrdered = arts.some(
      (a) => a.quantity >= 1 && !getArtPrintSize(a, cfg).error,
    )
    if (!hasOrdered) {
      setStatus('Sobras: defina primeiro as quantidades do pedido (≥ 1).')
      return
    }
    const result = fillLeftoverQuantities(arts, cfg)
    setArts(result.arts)
    if (result.sheetsBefore === 0) {
      setStatus('Sobras: nenhuma folha gerada ainda.')
    } else if (result.added === 0) {
      setStatus(`Sobras: sem espaço extra (folha ainda ${result.sheetsBefore}).`)
    } else {
      setStatus(
        `Sobras: +${result.added} peças (folha ainda ${result.sheetsAfter}).`,
      )
    }
  }

  const setQty = (id: string, qty: number) => {
    setArts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, quantity: Math.max(0, Math.floor(qty) || 0) } : a,
      ),
    )
  }

  const toggleRotate90 = (id: string) => {
    setArts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, rotate90: !a.rotate90 } : a)),
    )
  }

  const handleRotateSelected = () => {
    const ids = new Set(arts.filter((a) => selectedIds[a.id]).map((a) => a.id))
    if (ids.size === 0) {
      setStatus('Girar 90°: marque ao menos uma arte.')
      return
    }
    setArts((prev) =>
      prev.map((a) => (ids.has(a.id) ? { ...a, rotate90: !a.rotate90 } : a)),
    )
    setStatus(`Girar 90°: ${ids.size} arte(s) alternada(s).`)
  }

  const downloadArtPng = (art: ArtItem) => {
    art.trimmedCanvas.toBlob((blob) => {
      if (!blob) return
      const base = art.name.replace(/\.png$/i, '')
      const suffix = config.trimEnabled ? '-cortada' : ''
      saveAs(blob, `${base}${suffix}.png`)
    }, 'image/png')
  }

  /** DPI efetivo do export: nativo das PNGs (padrão) ou forçado pelo preset. */
  const effectiveDpi = useMemo(
    () => resolveExportDpi(arts, config),
    [arts, config],
  )

  const nativeDpi = useMemo(
    () => computeNativeExportDpi(arts, config),
    [arts, config],
  )

  const exportQuality = useMemo(() => getExportQuality(config), [config])

  const setExportQuality = useCallback(
    (quality: ExportQualityPreset) => {
      setConfig((c) => applyExportQuality(c, quality, computeNativeExportDpi(arts, c)))
    },
    [arts],
  )

  /** Config de export — dpi nativo ou preset (nunca o DPI do preview). */
  const exportPackConfig = useMemo(
    () => ({ ...config, dpi: effectiveDpi }),
    [config, effectiveDpi],
  )

  /** DPI baixo só para packing + preview ao vivo (evita OOM ~780 DPI). */
  const previewDpi = useMemo(
    () => Math.min(effectiveDpi, PREVIEW_DPI_CAP),
    [effectiveDpi],
  )

  /** Estimativa de px do PNG exportado (largura × altura da folha no DPI escolhido). */
  const exportSizeEstimate = useMemo(() => {
    if (sheets[0]) {
      const target = scalePackedSheet(sheets[0], previewDpi, effectiveDpi)
      const geo = resolveExportGeometry(target, effectiveDpi, { cropEmpty: config.cropEmptyExport, marginMm: config.marginMm })
      return { w: geo.widthPx, h: geo.heightPx }
    }
    const w = roundPx(cmToPx(config.widthCm, effectiveDpi))
    const hCm = config.heightCm
    const h = roundPx(cmToPx(hCm, effectiveDpi))
    return { w, h }
  }, [config.widthCm, config.heightCm, config.sheetGrowMode, config.cropEmptyExport, config.marginMm, effectiveDpi, previewDpi, sheets])

  const previewPackConfig = useMemo(
    () => ({ ...config, dpi: previewDpi }),
    [config, previewDpi],
  )

  /** packConfig = preview (lista de tamanhos W×H cm usa as mesmas medidas em cm). */
  const packConfig = previewPackConfig

  const artRows = useMemo(() => {
    return arts.map((art) => {
      const ps = getArtPrintSize(art, packConfig)
      return { art, ps }
    })
  }, [arts, packConfig])

  // Empacotar com debounce + DPI de preview (export reempacota no DPI nativo)
  useEffect(() => {
    if (arts.length === 0) {
      setSheets([])
      setPackErrors([])
      setPackFatalError(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      try {
        const { sheets: packed, errors } = packArts(arts, previewPackConfig, {
          maxPreviewSheets: MAX_LIVE_PREVIEW_SHEETS,
        })
        if (cancelled) return
        setSheets(packed)
        setLayoutInput({ arts, config: previewPackConfig })
        setPackErrors(errors)
        setPackFatalError(null)
      } catch (e) {
        if (cancelled) return
        console.error(e)
        setSheets([])
        setPackErrors([])
        setPackFatalError(
          e instanceof Error
            ? e.message
            : 'Falha ao montar a folha (possível falta de memória). Reduza artes ou use DPI forçado menor.',
        )
      }
    }, PACK_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [arts, previewPackConfig])

  const layoutPending = layoutInput?.arts !== arts || layoutInput?.config !== previewPackConfig

  const exportOpts = useMemo(
    () => ({
      cropEmpty: !!config.cropEmptyExport,
      marginMm: config.marginMm,
    }),
    [config.cropEmptyExport, config.marginMm],
  )

  // A prévia acompanha o recorte da folha sem modificar o layout usado para exportar.
  const previewSheets = useMemo(() => sheets.map(sheet => {
    const full = scalePackedSheet(sheet, previewDpi, effectiveDpi)
    const geometry = resolveExportGeometry(full, effectiveDpi, exportOpts)
    return { ...full, ...geometry, previewUrl: '', utilizationPct: Math.min(100, geometry.placements.reduce((area, p) => area + p.width * p.height, 0) * 100 / (geometry.widthPx * geometry.heightPx)) }
  }), [sheets, previewDpi, effectiveDpi, exportOpts])
  const exportPlans = useMemo(() => sheets.map(sheet => planPngParts(scalePackedSheet(sheet, previewDpi, effectiveDpi), effectiveDpi, exportOpts)), [sheets, previewDpi, effectiveDpi, exportOpts])
  const counts = useMemo(() => ({
    requested: arts.reduce((n, art) => n + art.quantity, 0),
    placed: sheets.reduce((n, sheet) => n + sheet.placements.length, 0),
  }), [arts, sheets])


  /** Recupera o mesmo layout físico em resolução de exportação; falhas não usam um preview antigo. */
  const packForExport = (): PackedSheet[] => {
    const { sheets: packed, errors } = packArts(arts, exportPackConfig, { skipPreview: true })
    if (errors.length) throw new Error(errors.join('\n'))
    if (!packed.length) throw new Error('Nenhuma folha para exportar. Verifique as artes e suas quantidades.')
    return packed
  }

  const exportPngs = async (targets: PackedSheet[]) => {
    setExporting(true)
    cancelExportRef.current = false
    let completed = 0
    try {
      const downloads = planPngDownloads(targets, effectiveDpi, exportOpts, clientName, sheets.length)
      setPngDownloads(downloads)
      for (const item of downloads) {
        if (cancelExportRef.current) break
        setStatus(`Gerando PNG ${completed + 1}/${downloads.length} · ${effectiveDpi} DPI…`)
        await downloadPngPart(item)
        completed++
      }
      setStatus(`${completed}/${downloads.length} PNG(s) enviados ao navegador · ${effectiveDpi} DPI. ${downloads.length > 1 ? 'Se algum download for bloqueado, use os botões das partes abaixo.' : ''}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Erro ao exportar PNG. Use os botões das partes para tentar novamente.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportOne = async (sheet: PackedSheet) => {
    try {
      const target = packForExport().find((s) => s.index === sheet.index)
      if (!target) throw new Error('Folha não encontrada na montagem atual.')
      await exportPngs([target])
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Erro ao exportar PNG.') }
  }

  const handleExportAll = async () => {
    try { await exportPngs(packForExport()) }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Erro ao exportar PNG.') }
  }

  const handleDownloadPart = async (item: PngDownload) => {
    setExporting(true)
    try {
      setStatus(`Gerando ${item.filename}…`)
      await downloadPngPart(item)
      setStatus(`${item.filename} enviado ao navegador.`)
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Erro ao exportar parte.') }
    finally { setExporting(false) }
  }

  useEffect(() => { setPngDownloads([]); cancelExportRef.current = true }, [arts, config])

  const setGrowMode = (mode: SheetConfig['sheetGrowMode']) => {
    setConfig((c) => ({
      ...c,
      sheetGrowMode: mode,
      // Recortar a folha continua sendo uma escolha explícita.
      cropEmptyExport: c.cropEmptyExport,
      // Alterar a folha não troca a estratégia de montagem escolhida.
      packMode: c.packMode,
    }))
  }

  const isAutoHeight = config.sheetGrowMode === 'auto_height'
  const usedReadout = sheets[0]?.usedHeightCm
  const utilReadout = sheets[0]?.utilizationPct

  const statusClass =
    loading || exporting
      ? 'status-banner is-busy'
      : status
        ? status.includes('falharam') ? 'status-banner is-warning' : 'status-banner is-ok'
        : ''

  return (
    <div className="app folha-app">
      <header className="folha-page-header">
        <div>
          <p className="section-kicker">Folha · Gang Sheet</p>
          <h1>Montagem de folhas</h1>
        </div>
      </header>

      {effectiveDpi < nativeDpi && <p role="status" className="hint">A qualidade selecionada reduz os pixels das artes. Use Máxima para preservar os detalhes originais, especialmente em artes pequenas.</p>}
      {/* Barra superior — ações frequentes */}
      <div className="folha-toolbar">
        <label className="folha-tb-field">
          <span>Cliente</span>
          <input
            type="text"
            value={clientName}
            placeholder="Nome (opcional)"
            onChange={(e) => setClientName(e.target.value)}
            maxLength={80}
          />
        </label>

        <div className="folha-tb-group">
          <button
            type="button"
            className="btn primary sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            Importar PNG/PDF
          </button>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => folderInputRef.current?.click()}
            disabled={loading}
          >
            Pasta
          </button>
          {arts.length > 0 && (
            <button type="button" className="btn danger sm" onClick={clearArts}>
              Limpar
            </button>
          )}
        </div>

        <label className="folha-tb-check" title="Cortar bordas transparentes">
          <input
            type="checkbox"
            checked={config.trimEnabled}
            onChange={(e) => updateConfig('trimEnabled', e.target.checked)}
          />
          Recortar bordas da arte
        </label>

        <label className="folha-tb-check" title="Altera o tamanho da folha exportada, sem redimensionar as artes">
          <input
            type="checkbox"
            checked={config.cropEmptyExport}
            onChange={(e) => updateConfig('cropEmptyExport', e.target.checked)}
          />
          Recortar folha ao conteúdo
        </label>

        <select
          className="folha-tb-select"
          value={config.packMode}
          onChange={(e) =>
            updateConfig('packMode', e.target.value as PackMode)
          }
          title="Modo de montagem"
          aria-label="Modo de montagem"
        >
          <option value="maxrects">Máximo aproveitamento</option>
          <option value="grade">Corte organizado</option>
          <option value="group_rows">Agrupar por arte / pedido</option>
          <option value="group_cols">Agrupar colunas</option>
        </select>

        <select
          className="folha-tb-select"
          value={widthChoice}
          onChange={e => { setWidthChoice(e.target.value); if (e.target.value !== 'custom') updateConfig('widthCm', Number(e.target.value)) }}
          title="Largura da folha"
          aria-label="Largura da folha"
        >
          <option value="29">29 cm</option>
          <option value="41">41 cm</option>
          <option value="custom">Largura personalizada</option>
        </select>
        {widthChoice === 'custom' && <label className="folha-tb-field"><span>Largura personalizada (cm)</span><input type="number" min={1} step={0.1} value={config.widthCm} onChange={e => updateConfig('widthCm', Math.max(1, Number(e.target.value) || 1))} /></label>}
        <select
          className="folha-tb-select"
          value={lengthChoice}
          onChange={(e) => onLengthChange(e.target.value)}
          title="Comprimento da folha"
          aria-label="Comprimento da folha"
        >
          {LENGTH_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        {lengthChoice === 'custom' && <label className="folha-tb-field"><span>Compr. (cm)</span><input type="number" min={1} step={0.1} value={config.heightCm} onChange={e => updateConfig('heightCm', Math.max(1, Number(e.target.value) || 1))} /></label>}
        <label className="folha-tb-field folha-tb-export-quality">
          <span>Qualidade export</span>
          <select
            className="folha-tb-select"
            value={exportQuality}
            onChange={(e) =>
              setExportQuality(e.target.value as ExportQualityPreset)
            }
            title="DPI do PNG exportado (preview continua limitado)"
            aria-label="Qualidade do export"
          >
            <option value="native">Máxima (nativo ~{nativeDpi})</option>
            <option value="high">Alta (300 DPI)</option>
            <option value="fast">Rápida (150 DPI)</option>
            <option value="custom">Personalizado…</option>
          </select>
        </label>

        <span
          className="folha-tb-dpi"
          title="Tamanho aproximado do PNG no DPI de export escolhido"
        >
          ~{exportSizeEstimate.w}×{exportSizeEstimate.h} px · {effectiveDpi} DPI
        </span>

        <div className="folha-tb-group folha-tb-export">
          <button
            type="button"
            className="btn secondary sm"
            disabled={arts.length === 0}
            onClick={handlePreencherSobras}
            title="Adiciona cópias extras só no espaço vazio"
          >
            Preencher sobras
          </button>
          {sheets.length > 0 && (
            <button
              type="button"
              className="btn primary sm"
              disabled={exporting || loading || layoutPending}
              onClick={handleExportAll}
            >
              {sheets.length === 1 && (exportPlans[0]?.length ?? 0) === 1 ? 'Baixar PNG' : 'Baixar PNGs'}
            </button>
          )}
        </div>

        {(status || loading || exporting) && (
          <p className={`folha-tb-status ${statusClass || ''}`}>
            {loading && !status ? 'Aguarde…' : status}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,.png,application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && void importFiles(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          accept="image/png,.png,application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && void importFiles(e.target.files)}
        />
      </div>

      <section className="sheet-quick-settings" aria-label="Espaçamentos e medidas da folha">
        <label className="field"><span>Margem (cm)</span><input type="number" min={0} step={0.1} value={mmToCmField(config.marginMm)} onChange={e => updateConfig('marginMm', cmFieldToMm(e.target.value))} /></label>
        <label className="field"><span>Espaço H (cm)</span><input type="number" min={0} step={0.1} value={mmToCmField(config.gapXMm)} onChange={e => updateConfig('gapXMm', cmFieldToMm(e.target.value))} /></label>
        <label className="field"><span>Espaço V (cm)</span><input type="number" min={0} step={0.1} value={mmToCmField(config.gapYMm)} onChange={e => updateConfig('gapYMm', cmFieldToMm(e.target.value))} /></label>
        <label className="field"><span>Lado padrão (cm)</span><input type="number" min={0.1} step={0.1} value={config.maxSideCm} onChange={e => updateConfig('maxSideCm', Math.max(.1, Number(e.target.value) || 5))} /></label>
        {exportQuality !== 'native' && <label className="field"><span>DPI do export</span><input type="number" min={72} step={1} value={config.dpi} onChange={e => updateConfig('dpi', Math.max(72, Number(e.target.value) || 300))} /></label>}
      </section>
      <details className="advanced-settings"><summary>Opções de PDF e recorte</summary>
      <section className="card" aria-label="Importação de PDF">
        <label className="field"><span>Resolução ao importar PDF</span><select value={pdfImportDpi} onChange={(e) => setPdfImportDpi(Number(e.target.value))}><option value={300}>300 DPI</option><option value={600}>600 DPI (recomendado para detalhes pequenos)</option><option value={1200}>1200 DPI</option></select></label>
        <label><input type="checkbox" checked={removePdfWhite} onChange={(e) => setRemovePdfWhite(e.target.checked)} /> Remover fundo branco externo do PDF</label>
        <p className="hint">Ative apenas se o branco externo for fundo. Desative para manter partes brancas da arte. A opção vale para os próximos PDFs importados.</p>
      </section>
        <label className="field"><span>Sensib. corte (alpha)</span><input type="number" min={0} max={255} step={1} value={config.alphaThreshold} disabled={!config.trimEnabled} onChange={e => updateConfig('alphaThreshold', Math.min(255, Math.max(0, Number(e.target.value) || 0)))} /></label>
        <p className="hint">Zero preserva todos os pixels visíveis. O recorte da arte é independente do recorte da folha. As fontes são preservadas no modo Máxima.</p>
      </details>
      <p className="layout-summary" aria-live="polite">{layoutPending && arts.length ? 'Atualizando montagem…' : `${counts.placed} de ${counts.requested} peça(s) montadas · ${sheets.length} folha(s)`}
        {config.packMode === 'grade' ? ' · Corte organizado: fileiras alinhadas, da esquerda para a direita.' : config.packMode === 'maxrects' ? ' · Máximo aproveitamento pode exigir mais cortes.' : ' · Cópias da mesma arte e pedidos iguais ficam juntos.'}
        {isAutoHeight ? ` · Folha sob medida, até ${MAX_AUTO_HEIGHT_CM} cm.` : ''}</p>
      <nav className="editor-navigation" aria-label="Atalhos da montadora">
        <button type="button" className="btn sm" onClick={() => document.getElementById('studio-arts')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>Editar artes</button>
        <button type="button" className="btn sm" onClick={() => document.getElementById('studio-preview')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>Ver prévia</button>
      </nav>
      <main className="folha-layout">
        {/* CENTRO — preview */}
        <section className="folha-preview-pane" id="studio-preview">
          <div className="folha-preview-sticky">
            <div className="result-head">
              <div>
                <p className="section-kicker">Pré-visualização</p>
                <h2>
                  {isAutoHeight
                    ? 'Folha sob medida'
                    : sheets.length > 0
                      ? `${sheets.length} folha(s)`
                      : 'Folhas'}
                </h2>
              </div>
            </div>

            <div className="preview-controls">
              <label className="field"><span>Zoom da prévia</span><select value={zoom} onChange={e => setZoom(Number(e.target.value))}>
                <option value={1}>Ajustar à área</option><option value={1.5}>150%</option><option value={2}>200%</option><option value={3}>300%</option>
              </select></label>
              <label><input type="checkbox" checked={showCuts} onChange={e => setShowCuts(e.target.checked)} /> Mostrar guias de corte e PNGs</label>
              <label className="field">
                <span>Fundo da prévia</span>
                <select value={previewBackground} onChange={(e) => setPreviewBackground(e.target.value)}>
                  <option value="dark">Escuro</option>
                  <option value="light">Claro</option>
                  <option value="checker">Quadriculado</option>
                  <option value="custom">Cor personalizada</option>
                </select>
              </label>
              {previewBackground === 'custom' && <label className="field">
                <span>Cor da prévia</span>
                <input type="color" value={previewColor} onChange={(e) => setPreviewColor(e.target.value)} />
              </label>}
              <p className="hint">Somente visualização. Os PNGs e as artes individuais continuam transparentes.</p>
            </div>
            <p className="hint">Os PNGs priorizam cortes nos espaços entre artes, mantendo DPI e transparência. As guias são só da prévia: azul para corte em fileiras, verde para partes PNG e laranja quando uma arte precisa ser dividida.</p>
            {exporting && <button className="btn sm" type="button" onClick={() => { cancelExportRef.current = true }}>Parar após esta parte</button>}
            {pngDownloads.length > 1 && <section className="png-parts" aria-label="Partes PNG">
              <h3>{pngDownloads.length} PNGs separados</h3>
              {pngDownloads.some(item => item.part.cutsArtwork) && <p className="cut-alert" role="alert">Uma arte ultrapassa os limites de uma parte ou não há corredor livre para o corte. Confira as divisões antes de imprimir: essa arte será dividida entre PNGs.</p>}
              <p className="hint">Permita vários downloads no navegador ou baixe cada parte abaixo. Imprima a 100%, sem ajustar à página. Os nomes indicam linha (L), coluna (C) e posição em pixels na folha exportada.</p>
              {pngDownloads.map((item) => <button type="button" className="btn sm" key={item.filename}
                disabled={exporting || loading || layoutPending} onClick={() => void handleDownloadPart(item)}>
                {item.filename} · {(item.part.widthPx * 2.54 / item.dpi).toFixed(3)} × {(item.part.heightPx * 2.54 / item.dpi).toFixed(3)} cm
              </button>)}
            </section>}

            {layoutPending && arts.length > 0 && !packFatalError && <p role="status">Atualizando montagem…</p>}

            {isAutoHeight && sheets.length > 0 && usedReadout != null && (
              <div className="used-readout" role="status">
                <div className="used-readout-main">
                  <strong>Usado: {usedReadout.toFixed(3)} cm</strong>
                  <span>
                    Largura {config.widthCm} cm
                    {utilReadout != null ? ` · ${utilReadout.toFixed(1)}%` : ''}
                  </span>
                </div>
                <div className="used-bar" aria-hidden>
                  <div
                    className="used-bar-fill"
                    style={{
                      width: `${Math.min(100, (usedReadout / MAX_AUTO_HEIGHT_CM) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {packFatalError && (
              <ul className="errors">
                <li>{packFatalError}</li>
              </ul>
            )}

            {packErrors.length > 0 && (
              <ul className="errors">
                {packErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}

            {sheets.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">
                  {arts.length === 0
                    ? 'Aguardando artes'
                    : packFatalError
                      ? 'Falha ao montar'
                      : 'Nenhuma folha gerada'}
                </p>
                <p className="empty-state-desc">
                  {arts.length === 0
                    ? 'Importe PNGs na barra superior — a prévia aparece aqui.'
                    : packFatalError
                      ? packFatalError
                      : 'Verifique tamanhos, quantidades ou se a arte cabe na folha.'}
                </p>
              </div>
            ) : (
              <div className="sheets sheets-preview-large">
                {sheets.map((sheet) => (
                  <div key={sheet.index} className="sheet-card sheet-card-large">
                    <div className="sheet-meta">
                      <strong>
                        {isAutoHeight ? 'Tira contínua' : `Folha ${sheet.index + 1}`}
                      </strong>
                      <span>
                        {isAutoHeight
                          ? `${config.widthCm} × ${sheet.usedHeightCm?.toFixed(3) ?? '?'} cm`
                          : `${config.widthCm} × ${config.heightCm} cm`}
                        {' · '}
                        {sheet.placements.length} peça(s)
                        {' · '}Exportação: {(() => { const g = resolveExportGeometry(scalePackedSheet(sheet, previewDpi, effectiveDpi), effectiveDpi, exportOpts); return `${(g.widthPx * 2.54 / effectiveDpi).toFixed(3)} × ${(g.heightPx * 2.54 / effectiveDpi).toFixed(3)} cm` })()}
                        {config.cropEmptyExport ? ' · recortado' : ''}
                        {' · '}{previewSheets[sheet.index]?.utilizationPct?.toFixed(1)}% de ocupação aproximada
                        {' · '}{(exportPlans[sheet.index]?.length ?? 0)} PNG(s)
                      </span>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={exporting || loading || layoutPending}
                        onClick={() => handleExportOne(sheet)}
                      >
                        PNG
                      </button>
                    </div>
                    {exportPlans[sheet.index]?.some(part => part.cutsArtwork) && <p className="cut-alert sheet-cut-warning" role="alert">Esta divisão atravessa uma arte. As guias laranja indicam as partes que precisam ser conferidas antes de imprimir.</p>}
                    <div className={`sheet-preview preview-${previewBackground}${previewBackground === 'checker' ? ' checker' : ''}`}
                      style={{ backgroundColor: previewBackground === 'custom' ? previewColor : previewBackground === 'light' ? '#f5f5f5' : previewBackground === 'dark' ? '#202634' : undefined }}>
                      <PreviewSurface sheet={previewSheets[sheet.index] ?? sheet}
                        parts={exportPlans[sheet.index] ?? []}
                        zoom={zoom} showCuts={showCuts} organized={config.packMode === 'grade' || config.packMode === 'group_rows'} focusedArt={focusedArt} onSelect={selectFromPreview} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Editor de artes: primeira coluna no computador e primeiro painel no celular. */}
        <aside className="folha-arts" id="studio-arts">
          <section className="card folha-card folha-arts-card">
            <div className="folha-card-head folha-arts-head">
              <div>
                <p className="section-kicker">Artes</p>
                <h2>Lista ({arts.length})</h2>
              </div>
              {arts.length > 0 && (
                <div className="art-toolbar">
                  <button type="button" className="btn sm danger" disabled={!arts.some((art) => selectedIds[art.id])}
                    onClick={removeSelectedArts}>Excluir selecionadas</button>
                  <button type="button" className="btn sm" onClick={selectAllArts}>
                    Todas
                  </button>
                  <button type="button" className="btn sm" onClick={clearSelection}>
                    Nenhuma
                  </button>
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={handleDividirIguais}
                    title="Mesma qtd máxima nas marcadas, 1 folha"
                  >
                    Dividir iguais
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={handleRotateSelected}
                    title="Girar 90° nas selecionadas"
                  >
                    90° sel.
                  </button>
                </div>
              )}
            </div>

            {undoRemoval.length > 0 && <button type="button" className="btn sm" title="Desfazer a última exclusão, disponível por 60 segundos" onClick={restoreArts}>Desfazer exclusão ({undoRemoval.length})</button>}
            {arts.length > 0 && <details className="batch-tools"><summary>Editar selecionadas ({arts.filter(art => selectedIds[art.id]).length})</summary>
              <p className="hint">As ações abaixo alteram somente as artes marcadas.</p>
              <label className="field"><span>Quantidade em lote</span><input type="number" min={0} step={1} value={batchQuantity} onChange={e => setBatchQuantity(Number(e.target.value))} /></label>
              <button type="button" className="btn sm" onClick={() => applyToSelected('quantity')}>Aplicar quantidade</button>
              <label className="field"><span>Largura em lote (cm)</span><input type="number" min={0.01} step={0.1} value={batchWidth} onChange={e => setBatchWidth(Number(e.target.value))} /></label>
              <button type="button" className="btn sm" onClick={() => applyToSelected('width')}>Aplicar largura</button>
              <label className="field"><span>Pedido em lote</span><input value={batchGroup} maxLength={80} onChange={e => setBatchGroup(e.target.value)} /></label>
              <button type="button" className="btn sm" onClick={() => applyToSelected('group')}>Aplicar pedido</button>
            </details>}
            {arts.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">Nenhuma arte</p>
                <p className="empty-state-desc">
                  Use Importar PNG/PDF ou Pasta na barra superior.
                </p>
              </div>
            ) : (
              <div className="art-list">
                {artRows.map(({ art, ps }) => <article key={art.id} id={`art-${art.id}`} className={`art-editor ${focusedArt === art.id ? 'is-focused' : ''} ${ps.error ? 'row-error' : ''}`}>
                  <header className="art-editor-head">
                    <input type="checkbox" checked={!!selectedIds[art.id]} onChange={() => toggleSelect(art.id)} aria-label={`Selecionar ${art.name}`} />
                    <div className={`thumb checker${art.rotate90 ? ' thumb-rotated' : ''}`}><img src={art.thumbnailUrl} alt={art.name} /></div>
                    <strong>{art.name}</strong>
                    <button type="button" className="btn sm danger art-delete" onClick={() => removeArt(art.id)} aria-label={`Excluir arte ${art.name}`} title={`Excluir arte ${art.name}`}>×</button>
                  </header>
                  <div className="art-editor-fields">
                    <label className="field"><span>Largura (cm)</span><MeasurementInput value={ps.widthCm} label={`Largura ${art.name}`} onValue={value => setArtMeasurement(art.id, 'width', value)} /></label>
                    <label className="field"><span>Altura (cm)</span><MeasurementInput value={ps.heightCm} label={`Altura ${art.name}`} onValue={value => setArtMeasurement(art.id, 'height', value)} /></label>
                    <label className="field"><span>Quantidade</span><input type="number" min={0} step={1} value={art.quantity} onChange={e => setQty(art.id, Number(e.target.value))} aria-label={`Quantidade ${art.name}`} /></label>
                  </div>
                  <label className="aspect-control"><input type="checkbox" checked={art.lockAspect !== false} aria-label={`Manter proporção ${art.name}`}
                    onChange={e => { const locked = e.target.checked; setArts(prev => prev.map(a => a.id !== art.id ? a : locked ? resizeArt({ ...a, lockAspect: true }, 'width', ps.widthCm, config.maxSideCm) : { ...a, lockAspect: false })) }} /> Manter proporção</label>
                  {art.lockAspect === false && <p className="hint cut-alert">Proporção livre: medidas independentes podem deformar a arte.</p>}
                  <details className="art-group"><summary>Pedido / grupo{art.groupName ? `: ${art.groupName}` : ' (opcional)'}</summary>
                    <label className="field"><span>Identificação do pedido</span><input value={art.groupName ?? ''} maxLength={80} onChange={e => setArts(prev => prev.map(a => a.id === art.id ? { ...a, groupName: e.target.value } : a))} aria-label={`Pedido ${art.name}`} /></label>
                  </details>
                  <p className="mono art-cm">{ps.widthCm.toFixed(3)}×{ps.heightCm.toFixed(3)}{art.rotate90 ? ' ↻' : ''}</p>
                  {ps.error && <p className="err">{ps.error}</p>}
                  <div className="row-actions">
                    <button type="button" className={`btn sm${art.rotate90 ? ' primary' : ''}`} aria-pressed={art.rotate90} onClick={() => toggleRotate90(art.id)} title="Girar 90°">90°</button>
                    <button type="button" className="btn sm" onClick={() => duplicateArt(art)} aria-label={`Duplicar ${art.name}`}>Duplicar tamanho</button>
                    <button type="button" className="btn sm" disabled={!!ps.error} onClick={() => handleEncherFolha(art.id)}>Encher</button>
                    <button type="button" className="btn sm" onClick={() => downloadArtPng(art)} title="Baixar PNG cortado">Baixar arte</button>
                  </div>
                </article>)}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}
