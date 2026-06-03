// Generic, tolerant order → ReceiptDocument mapper. Promoted from the playground's
// inline importOrder() so any POS / e-commerce order shape can be coerced.
import type { ReceiptDocument } from '@receipt-engine/core'

/** A loose external order — every field optional; we read whatever is present. */
export interface LooseOrder {
  locale?: string
  currency?: string
  merchant?: string
  store?: { name?: string; tagline?: string; icon?: string; logoUrl?: string }
  orderId?: string | number
  number?: string | number
  receiptNo?: string | number
  createdAt?: string
  issuedAt?: string
  cashier?: string
  lineItems?: LooseLineItem[]
  items?: LooseLineItem[]
  discounts?: { title?: string; label?: string; amount?: number }[]
  payments?: LoosePayment[]
  tenders?: LoosePayment[]
  note?: string
}
export interface LooseLineItem {
  name?: string
  title?: string
  variant?: string
  options?: string[]
  quantity?: number
  qty?: number
  unitPrice?: number
  price?: number
  total?: number
  note?: string
  tags?: string[]
}
export interface LoosePayment {
  method?: string
  type?: string
  amount?: number
  reference?: string
}

function mapLineItem(li: LooseLineItem): ReceiptDocument['items'][number] {
  const quantity = Number(li.quantity != null ? li.quantity : li.qty != null ? li.qty : 1)
  const unitPrice = Number(
    li.unitPrice != null
      ? li.unitPrice
      : li.price != null
        ? li.price
        : (li.total ?? 0) / (quantity || 1) || 0,
  )
  return {
    name: li.name || li.title || '',
    variant: li.variant || (li.options && li.options.join(' / ')) || undefined,
    quantity,
    unitPrice,
    note: li.note || undefined,
    tags: li.tags || undefined,
  }
}

/** Coerce a loose external order into a ReceiptDocument (not yet validated). */
export function importOrder(ext: LooseOrder = {}): ReceiptDocument {
  const items = (ext.lineItems || ext.items || []).map(mapLineItem)
  return {
    schemaVersion: '0.1',
    locale: ext.locale,
    currency: (ext.currency || 'TWD').toUpperCase(),
    merchant: {
      name: ext.store?.name || ext.merchant || 'Shop',
      subtitle: ext.store?.tagline,
      icon: ext.store?.icon,
      logo: ext.store?.logoUrl,
    },
    transaction: {
      receiptNo: String(ext.orderId ?? ext.number ?? ext.receiptNo ?? ''),
      issuedAt: ext.createdAt || ext.issuedAt || '',
      cashier: ext.cashier,
    },
    items: items.length ? items : [{ name: '—', quantity: 1, unitPrice: 0 }],
    discounts: (ext.discounts || []).map((d) => ({
      label: d.title || d.label || 'Discount',
      amount: Math.abs(Number(d.amount || 0)),
    })),
    payments: (ext.payments || ext.tenders || []).map((p) => ({
      method: p.method || p.type || 'Cash',
      amount: Number(p.amount || 0),
      reference: p.reference,
    })),
    message: ext.note ? { body: ext.note } : undefined,
  }
}
