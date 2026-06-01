import type { ReceiptDiscount, ReceiptItem, ReceiptTotals } from './schema'

/** Round to 2 decimal places, avoiding common float artifacts. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Resolve an item's line subtotal, computing `quantity * unitPrice` when absent. */
export function itemSubtotal(item: ReceiptItem): number {
  return item.subtotal ?? round2(item.quantity * item.unitPrice)
}

/**
 * Compute the core money figures from line items and discounts.
 * Tax, service fee, payments and change are layered on by `normalizeReceipt`.
 */
export function calculateTotals(
  items: ReceiptItem[],
  discounts: ReceiptDiscount[] = [],
): ReceiptTotals {
  const subtotal = round2(items.reduce((sum, item) => sum + itemSubtotal(item), 0))
  const discountTotal = round2(discounts.reduce((sum, discount) => sum + discount.amount, 0))
  const total = round2(subtotal - discountTotal)
  return { subtotal, discountTotal, total }
}
