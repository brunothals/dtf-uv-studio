import logoUrl from '../../../assets/dtfuvmania-logo-transparent.png'
import { customerMoney, moneyText, type CustomerOrder } from './customerOrder'

export interface ApprovalArt {
  name: string
  widthCm: number
  heightCm: number
  quantity: number
  color?: string
  source: HTMLCanvasElement
  rotated: boolean
}
export interface ApprovalOptions {
  pages: boolean
  backdrop: 'auto' | 'light' | 'dark'
  revision: string
}
export const BRAND = { pink: '#ff2eaa', cyan: '#26d9ee', yellow: '#ffd600', ink: '#101015' }
const number = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n)
export const approvalDisplayName = (name: string) => name.replace(/\.(png|jpe?g|pdf)$/i, '').replace(/\s*-\s*c[oó]pia\s+\d+\s+de\s+\d+\s*$/i, '').trim()

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) {
  let value = text.replace(/[\r\n\t]/g, ' ')
  if (ctx.measureText(value).width > width) {
    while (value.length && ctx.measureText(value + '…').width > width) value = value.slice(0, -1)
    value += '…'
  }
  ctx.fillText(value, x, y)
}
function darkArtBackdrop(source: HTMLCanvasElement): boolean {
  const c = document.createElement('canvas'); c.width = 48; c.height = 48
  const x = c.getContext('2d')!; x.drawImage(source, 0, 0, 48, 48)
  const pixels = x.getImageData(0, 0, 48, 48).data
  let light = 0, weight = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] / 255
    weight += a; light += ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 765) * a
  }
  return weight > 0 && light / weight > .65
}
function loadLogo(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Não foi possível carregar o logo local da DTF UV Mania.')); img.src = logoUrl })
}

/** Client proofs are independent JPEGs: never drawn into production PNGs. */
export async function renderApprovalPages(arts: ApprovalArt[], order: CustomerOrder, sheetLabel: string, options: ApprovalOptions): Promise<Blob[]> {
  const active = arts.filter(a => a.quantity > 0)
  if (!active.length) throw new Error('Não há artes para gerar a aprovação.')
  let price: number | undefined, freight: number | undefined
  if (order.price.trim()) price = customerMoney(order.price)
  if (order.freight.trim()) freight = customerMoney(order.freight)
  const perPage = options.pages ? 12 : active.length
  const batches = Array.from({ length: Math.ceil(active.length / perPage) }, (_, i) => active.slice(i * perPage, (i + 1) * perPage))
  const logo = await loadLogo(), blobs: Blob[] = []
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const registration=([['phone','Telefone'],['document','CPF/CNPJ'],['zip','CEP'],['street','Rua'],['number','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','Estado']] as const).filter(([key])=>order[key]?.trim()).map(([key,label])=>label+': '+order[key]!.trim())
  const registrationRows=Math.ceil(registration.length/2), comparisons=order.comparisonLines||[]
  for (const [page, items] of batches.entries()) {
    const width = 1600, bodyY = 340+registrationRows*32, cardH = 250, footerY = bodyY + Math.ceil(items.length / 2) * cardH, footerH=310+(comparisons.length?50+comparisons.length*32:0), height = footerY + footerH
    if (height > 16384 || width * height > 16 * 1024 * 1024) throw new Error('Muitos modelos para uma única imagem legível. Selecione Páginas de 12 modelos.')
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx || canvas.width !== width || canvas.height !== height) throw new Error('Memória insuficiente para a aprovação. Use páginas de 12 modelos.')
    try {
      ctx.fillStyle = '#f6f5fa'; ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = BRAND.ink; ctx.fillRect(0, 0, width, 210)
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, BRAND.cyan); gradient.addColorStop(.5, BRAND.pink); gradient.addColorStop(1, BRAND.yellow)
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, 10)
      const logoScale = Math.min(240 / logo.naturalWidth, 160 / logo.naturalHeight)
      const logoW = logo.naturalWidth * logoScale, logoH = logo.naturalHeight * logoScale
      ctx.drawImage(logo, 48 + (240 - logoW) / 2, 30 + (160 - logoH) / 2, logoW, logoH)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 46px Arial'; ctx.fillText('Sua arte, pronta para conferir.', 330, 90)
      ctx.font = '24px Arial'; ctx.fillStyle = '#dddbe5'; ctx.fillText('DTF UV MANIA  /  APROVAÇÃO DO PEDIDO', 332, 136)
      ctx.fillStyle = BRAND.cyan; ctx.font = '22px Arial'; ctx.fillText('dtfuvmania.com.br', 332, 175)
      ctx.fillStyle = BRAND.ink; ctx.font = 'bold 28px Arial'; fitText(ctx, order.name ? 'Cliente: ' + order.name : 'Conferência das artes', 56, 258, 980)
      ctx.font = '22px Arial'; fitText(ctx, 'Pedido: ' + (order.orderId || 'sem número') + '  ·  Revisão ' + (options.revision || '1'), 56, 298, 1120)
      ctx.fillStyle = '#55515f'; ctx.font = '20px Arial'; ctx.fillText(date + `  ·  ${page + 1}/${batches.length}`, 1300, 296)
      registration.forEach((line,i)=>fitText(ctx,line,56+(i%2)*766,335+Math.floor(i/2)*32,720))
      for (const [i, art] of items.entries()) {
        const x = 48 + (i % 2) * 766, y = bodyY + Math.floor(i / 2) * cardH
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 738, 226)
        ctx.strokeStyle = '#dfdbe6'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 738, 226)
        ctx.fillStyle = BRAND.pink; ctx.fillRect(x, y, 5, 226)
        ctx.font = 'bold 21px Arial'; ctx.fillStyle = BRAND.ink
        fitText(ctx, `MODELO ${String(page * perPage + i + 1).padStart(2, '0')}  ·  ${art.name}`, x + 20, y + 31, 695)
        const dark = options.backdrop === 'dark' || options.backdrop === 'auto' && darkArtBackdrop(art.source)
        ctx.fillStyle = dark ? '#252c3a' : '#ecf0f4'; ctx.fillRect(x + 18, y + 48, 204, 160)
        const ratio = art.widthCm / art.heightCm
        const w = Math.min(184, 142 * ratio), h = w / ratio
        const ax = x + 120 - w / 2, ay = y + 128 - h / 2
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
        if (art.rotated) { ctx.translate(ax + w, ay); ctx.rotate(Math.PI / 2); ctx.drawImage(art.source, 0, 0, h, w) }
        else ctx.drawImage(art.source, ax, ay, w, h)
        ctx.restore()
        ctx.fillStyle = BRAND.ink; ctx.font = 'bold 29px Arial'
        fitText(ctx, `${number(art.widthCm)} × ${number(art.heightCm)} cm`, x + 250, y + 88, 464)
        ctx.font = 'bold 27px Arial'; ctx.fillText(`${art.quantity} unidade${art.quantity === 1 ? '' : 's'}`, x + 250, y + 132)
        ctx.font = '21px Arial'; ctx.fillStyle = '#62586c'
        fitText(ctx, 'Cor: ' + (art.color || order.color || 'não informada'), x + 250, y + 175, 460)
      }
      ctx.fillStyle = BRAND.ink; ctx.fillRect(0, footerY, width, footerH)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 25px Arial'; fitText(ctx, sheetLabel, 56, footerY + 46, 1480)
      ctx.font = '23px Arial'; ctx.fillText(`Pedido completo: ${active.length} modelo(s) · ${active.reduce((n, a) => n + a.quantity, 0)} peças`, 56, footerY + 88)
      ctx.fillStyle = '#dddbe5'; ctx.font = '22px Arial'
      const amounts = [price == null ? '' : 'Produto: ' + moneyText(price), freight == null ? '' : 'Frete: ' + (order.carrier || 'a definir') + ' — ' + moneyText(freight)].filter(Boolean).join('  |  ')
      fitText(ctx, amounts, 56, footerY + 126, 1480)
      if(price!=null&&freight!=null){ctx.fillStyle=BRAND.yellow;ctx.font='bold 44px Arial';fitText(ctx,'TOTAL DO PEDIDO: '+moneyText(price+freight),56,footerY+180,1480)}
      ctx.font='21px Arial';ctx.fillStyle='#dddbe5';fitText(ctx,[order.production?'Produção: '+order.production:'',order.delivery?'Transporte: '+order.delivery:''].filter(Boolean).join(' · '),56,footerY+218,1480)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.fillText('Confira os modelos e responda se podemos seguir com a produção.', 56, footerY + 248)
      ctx.fillStyle = BRAND.pink; ctx.font = 'bold 18px Arial'; ctx.fillText('IMAGEM PARA APROVAÇÃO  ·  NÃO USAR COMO ARQUIVO DE IMPRESSÃO', 56, footerY + 270)
      if(comparisons.length){ctx.fillStyle=BRAND.cyan;ctx.font='bold 23px Arial';ctx.fillText('OUTRAS FOLHAS — CAPACIDADE ESTIMADA',56,footerY+320);ctx.fillStyle='#fff';ctx.font='22px Arial';comparisons.forEach((line,i)=>fitText(ctx,line,56,footerY+355+i*32,1480))}
      blobs.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem de aprovação.')), 'image/jpeg', .94)))
    } finally { canvas.width = 0; canvas.height = 0 }
  }
  return blobs
}
