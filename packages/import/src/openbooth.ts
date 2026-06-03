// OpenBooth (Boothレジ / 擺攤收銀台) adapter. Maps the committed transaction
// object produced by OpenBooth's front.js complete() — i.e. the `savedTx` right
// after OB.store.addTransaction(tx) — into a validated ReceiptDocument.
//
// The receipt's *look* (theme, fonts, colors, message, styleOverrides, blockOrder)
// comes from the merchant's saved template, applied separately via applyTemplate().
import type { ReceiptDocument } from '@receipt-engine/core'

/** One committed sale line (OpenBooth front.js complete()). */
export interface OpenBoothTxLine {
  kind: 'product' | 'combo'
  refId: string
  name: string
  unitPrice: number
  basePrice: number
  qty: number
  lineTotal: number
  isTokuten: boolean
}

/** The committed sale (state.transactions[], built in complete()). */
export interface OpenBoothTx {
  id: string | number
  time: number // epoch ms (set by store.addTransaction)
  eventId?: string
  voided?: boolean
  lines: OpenBoothTxLine[]
  subtotal: number
  discount: number
  bundleSaved: number
  grandTotal: number
  stockUse?: Record<string, number>
  paymentMethodId?: string
  paymentMethodName?: string
  paymentType?: 'cash' | 'external'
  cashReceived?: number | null
  changeGiven?: number | null
  giftNote?: string
}

/** Relevant slice of OB.store.get().settings. */
export interface OpenBoothSettings {
  shopName?: string
  currencyCode?: string
  currencySymbol?: string
  locale?: string
  theme?: string
}

/** OB.store.currentEvent() (optional booth/event context). */
export interface OpenBoothEvent {
  id?: string
  name?: string
  boothName?: string
  boothNumber?: string
  location?: string
  date?: string
}

export interface ImportOpenBoothOptions {
  settings?: OpenBoothSettings
  event?: OpenBoothEvent
  /** Optional tokuten (特典/freebie) badge label; default '特典'. */
  tokutenLabel?: string
}

/** Epoch ms → local ISO-8601 with offset (e.g. 2026-06-01T16:05:00+08:00). */
export function epochToLocalIso(ms: number): string {
  const d = new Date(ms)
  const p = (n: number): string => String(n).padStart(2, '0')
  const offMin = -d.getTimezoneOffset()
  const sign = offMin >= 0 ? '+' : '-'
  const oh = p(Math.floor(Math.abs(offMin) / 60))
  const om = p(Math.abs(offMin) % 60)
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${oh}:${om}`
  )
}

/** Map an OpenBooth committed transaction to a ReceiptDocument (data only). */
export function importOpenBoothOrder(
  tx: OpenBoothTx,
  opts: ImportOpenBoothOptions = {},
): ReceiptDocument {
  const s = opts.settings ?? {}
  const tokuten = opts.tokutenLabel ?? '特典'

  const items: ReceiptDocument['items'] = (tx.lines ?? []).map((l) => ({
    name: l.name,
    quantity: l.qty,
    unitPrice: l.unitPrice,
    // bundle/manual pricing means lineTotal may ≠ qty×unitPrice — keep it exact.
    subtotal: l.lineTotal,
    tags: l.isTokuten ? [tokuten] : undefined,
  }))

  const discounts =
    tx.discount && tx.discount > 0 ? [{ label: '折扣 Discount', amount: tx.discount }] : undefined

  // Cash: amount tendered = cashReceived (so change = paid − total = changeGiven).
  const paid = tx.cashReceived != null ? tx.cashReceived : tx.grandTotal
  const method =
    tx.paymentMethodName || (tx.paymentType === 'cash' ? '現金 Cash' : '其他 Other')
  const payments = [{ method, amount: paid }]

  const doc: ReceiptDocument = {
    schemaVersion: '0.1',
    locale: s.locale,
    currency: (s.currencyCode || 'TWD').toUpperCase(),
    merchant: { name: s.shopName || undefined },
    transaction: {
      receiptNo: String(tx.id),
      issuedAt: epochToLocalIso(tx.time),
    },
    items: items.length ? items : [{ name: '—', quantity: 1, unitPrice: 0 }],
    discounts,
    payments,
    // Pin totals to OpenBooth's figures so the receipt always reconciles.
    totals: {
      subtotal: tx.subtotal,
      discountTotal: tx.discount || 0,
      total: tx.grandTotal,
      paid,
      change: tx.changeGiven != null ? tx.changeGiven : Math.max(0, paid - tx.grandTotal),
    },
  }

  const ev = opts.event
  if (ev && (ev.name || ev.boothName || ev.boothNumber)) {
    // Drop empty strings → undefined so blank fields don't render (e.g. a bare "Booth ").
    doc.event = {
      name: ev.name || undefined,
      boothName: ev.boothName || undefined,
      boothNumber: ev.boothNumber || undefined,
      location: ev.location || undefined,
      date: ev.date || undefined,
    }
  }
  if (tx.giftNote) doc.message = { body: tx.giftNote }
  return doc
}
