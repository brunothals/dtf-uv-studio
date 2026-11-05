import '../../../quote-core.js'

export interface CustomerOrder {
  name: string
  orderId: string
  color: string
  price: string
  freight: string
  carrier: string
  production: string
  delivery: string
  notes: string
  phone?: string
  document?: string
  zip?: string
  street?: string
  number?: string
  complement?: string
  district?: string
  city?: string
  state?: string
  comparisonLines?: string[]
  quotedSheet?: { widthCm: number; heightCm: number; quantity: number }
}
interface ConfirmationArt { widthCm: number; heightCm: number; quantity: number; color?: string }
interface QuoteApi {
  cents(value: string): number
  money(value: number): string
  generateConfirmation(rows: { id: string; label: string; price: number; quantity: number; arts: ConfirmationArt[] }[], config: Record<string, unknown>): string
}
const quote = (globalThis as typeof globalThis & { Quote: QuoteApi }).Quote
export const customerMoney = (value: string) => quote.cents(value)
export const moneyText = (value: number) => quote.money(value)

export function emptyCustomerOrder(): CustomerOrder {
  return { name: '', orderId: '', color: '', price: '', freight: '0,00', carrier: 'Correios', production: '', delivery: '', notes: '' }
}
export function readCustomerOrder(search: string): CustomerOrder {
  const blank = emptyCustomerOrder(), token = new URLSearchParams(search).get('pedido')
  if (!token || !/^[a-zA-Z0-9-]{10,80}$/.test(token)) return blank
  try {
    const raw = JSON.parse(localStorage.getItem('dtf-order-handoff:' + token) ?? 'null')
    if (!raw || raw.version !== 1 || !Number.isFinite(raw.createdAt) || Date.now() - raw.createdAt > 86400000 || raw.createdAt > Date.now() + 60000) return blank
    for (const key of ['name', 'orderId', 'color', 'carrier', 'production', 'delivery', 'notes','phone','document','zip','street','number','complement','district','city','state'] as const) if (typeof raw[key] === 'string') blank[key] = raw[key].slice(0, key === 'notes' ? 1000 : 160)
    for (const key of ['price', 'freight'] as const) if (Number.isSafeInteger(raw[key]) && raw[key] >= 0 && raw[key] <= 1e12) blank[key] = (raw[key] / 100).toFixed(2).replace('.', ',')
    if (Number.isFinite(raw.widthCm) && Number.isFinite(raw.heightCm) && Array.isArray(raw.arts)) {
      const quantity = raw.arts.reduce((n: number, a: { quantity?: number }) => n + (Number.isSafeInteger(a.quantity) && a.quantity! > 0 ? a.quantity! : 0), 0)
      blank.quotedSheet = { widthCm: raw.widthCm, heightCm: raw.heightCm, quantity }
    }
    return blank
  } catch { return blank }
}

export function customerConfirmation(order: CustomerOrder, sheetLabel: string, arts: ConfirmationArt[]): string {
  if (!order.price.trim()) throw new Error('Informe o valor do produto para copiar a confirmação.')
  const text=quote.generateConfirmation([{ id: 'actual', label: sheetLabel, price: customerMoney(order.price),
    quantity: arts.reduce((n, a) => n + a.quantity, 0), arts }], { ...order, mode: 'confirmation', sheet: 'actual',
    freight: customerMoney(order.freight), estimated: false })
  return order.comparisonLines?.length ? text+'\n\nOutras folhas — encaixe estimado, sem alterar seu pedido:\n'+order.comparisonLines.join('\n') : text
}
