import { describe, expect, it } from 'vitest'
import { normalizeReceipt, type ReceiptDocument } from '@receipt-engine/core'

const base: ReceiptDocument = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Booth' },
  transaction: { receiptNo: 'R-100', issuedAt: '2026-06-01T12:00:00+08:00' },
  items: [
    { name: 'Sticker Set', quantity: 2, unitPrice: 100 },
    { name: 'Mini Zine', quantity: 1, unitPrice: 150 },
  ],
}

describe('normalizeReceipt', () => {
  it('fills item subtotals', () => {
    const normalized = normalizeReceipt(base)
    expect(normalized.items[0].subtotal).toBe(200)
    expect(normalized.items[1].subtotal).toBe(150)
  })

  it('computes totals from items and discounts', () => {
    const normalized = normalizeReceipt({
      ...base,
      discounts: [{ label: 'Combo', amount: 50 }],
    })
    expect(normalized.totals.subtotal).toBe(350)
    expect(normalized.totals.discountTotal).toBe(50)
    expect(normalized.totals.total).toBe(300)
  })

  it('computes paid and change from payments', () => {
    const normalized = normalizeReceipt({
      ...base,
      payments: [{ method: 'Cash', amount: 400 }],
    })
    expect(normalized.totals.total).toBe(350)
    expect(normalized.totals.paid).toBe(400)
    expect(normalized.totals.change).toBe(50)
  })

  it('honors explicitly provided totals over computed ones', () => {
    const normalized = normalizeReceipt({ ...base, totals: { total: 999 } })
    expect(normalized.totals.total).toBe(999)
  })
})
