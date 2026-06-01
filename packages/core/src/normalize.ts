import type { ReceiptDocument, ReceiptItem } from './schema'
import { calculateTotals, itemSubtotal, round2 } from './totals'

export interface NormalizedReceiptItem extends ReceiptItem {
  subtotal: number
}

export interface NormalizedReceiptTotals {
  subtotal: number
  discountTotal: number
  taxTotal: number
  serviceFee: number
  total: number
  paid: number
  change: number
}

export interface NormalizedReceiptDocument extends Omit<ReceiptDocument, 'items' | 'totals'> {
  items: NormalizedReceiptItem[]
  totals: NormalizedReceiptTotals
}

/**
 * Fill in every derived value so renderers can stay dumb:
 * item subtotals, totals, paid and change are all guaranteed present.
 * Explicitly provided values always win over computed ones.
 */
export function normalizeReceipt(input: ReceiptDocument): NormalizedReceiptDocument {
  const items: NormalizedReceiptItem[] = input.items.map((item) => ({
    ...item,
    subtotal: itemSubtotal(item),
  }))

  const computed = calculateTotals(items, input.discounts)
  const provided = input.totals ?? {}

  const subtotal = provided.subtotal ?? computed.subtotal ?? 0
  const discountTotal = provided.discountTotal ?? computed.discountTotal ?? 0
  const taxTotal = provided.taxTotal ?? 0
  const serviceFee = provided.serviceFee ?? 0
  const total = provided.total ?? round2(subtotal - discountTotal + taxTotal + serviceFee)
  const paid =
    provided.paid ?? round2((input.payments ?? []).reduce((sum, p) => sum + p.amount, 0))
  const change = provided.change ?? round2(paid - total)

  return {
    ...input,
    items,
    totals: { subtotal, discountTotal, taxTotal, serviceFee, total, paid, change },
  }
}
