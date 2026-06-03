// Overlay a saved *design* template onto an order's *data*. The order (items,
// totals, transaction, merchant name) comes from the POS; the template (branding,
// thank-you message, QR, per-element styles, block order, stickers) comes from the
// merchant's saved receipt design. Data wins for what the POS owns.
import type { ReceiptDocument } from '@receipt-engine/core'

/** The design-only subset of a ReceiptDocument a merchant configures once. */
export interface ReceiptTemplate {
  merchant?: ReceiptDocument['merchant']
  message?: ReceiptDocument['message']
  qr?: ReceiptDocument['qr']
  assets?: ReceiptDocument['assets']
  stickers?: ReceiptDocument['stickers']
  styleOverrides?: ReceiptDocument['styleOverrides']
  blockOrder?: ReceiptDocument['blockOrder']
}

function defined<T extends object>(o: T | undefined): Partial<T> {
  const out: Partial<T> = {}
  if (!o) return out
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k]
  return out
}

/** Merge a design template over an order-derived ReceiptDocument. */
export function applyTemplate(doc: ReceiptDocument, template: ReceiptTemplate = {}): ReceiptDocument {
  // Branding from the template (logo/subtitle/icon), but the POS's shop name wins.
  const merchant = { ...(template.merchant ?? {}), ...defined(doc.merchant) }
  // Message: keep the template's title/footer, but a per-sale note (doc.message.body,
  // e.g. OpenBooth giftNote) is POS-owned data and must win over the static template.
  const message =
    template.message || doc.message
      ? { ...(template.message ?? {}), ...defined(doc.message) }
      : undefined
  return {
    ...doc,
    merchant,
    message,
    qr: template.qr ?? doc.qr,
    assets: template.assets ?? doc.assets,
    stickers: template.stickers ?? doc.stickers,
    styleOverrides: template.styleOverrides ?? doc.styleOverrides,
    blockOrder: template.blockOrder ?? doc.blockOrder,
  }
}
