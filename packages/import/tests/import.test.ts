import { describe, expect, it } from 'vitest'
import { safeValidateReceipt } from '@receipt-engine/core'
import {
  applyTemplate,
  ensureValid,
  epochToLocalIso,
  importOpenBoothOrder,
  importOrder,
  type OpenBoothTx,
} from '@receipt-engine/import'

const tx: OpenBoothTx = {
  id: 'MKT-031',
  time: Date.parse('2026-06-01T16:05:00+08:00'),
  eventId: 'e1',
  lines: [
    { kind: 'product', refId: 'p1', name: '大豆蠟燭', unitPrice: 480, basePrice: 480, qty: 1, lineTotal: 480, isTokuten: false },
    { kind: 'product', refId: 'p2', name: '香氛蠟磚', unitPrice: 150, basePrice: 150, qty: 3, lineTotal: 400, isTokuten: false },
    { kind: 'product', refId: 'p3', name: '小卡', unitPrice: 0, basePrice: 0, qty: 1, lineTotal: 0, isTokuten: true },
  ],
  subtotal: 880,
  discount: 80,
  bundleSaved: 50,
  grandTotal: 800,
  paymentMethodName: 'Line Pay',
  paymentType: 'external',
  cashReceived: null,
  changeGiven: null,
  giftNote: '滿額禮:貼紙一張',
}

describe('importOpenBoothOrder', () => {
  it('produces a valid ReceiptDocument', () => {
    const doc = importOpenBoothOrder(tx, { settings: { shopName: 'Glow', currencyCode: 'TWD', locale: 'zh-TW' } })
    expect(safeValidateReceipt(doc).success).toBe(true)
  })

  it('maps lines, exact line totals and the tokuten badge', () => {
    const doc = importOpenBoothOrder(tx, { settings: { shopName: 'Glow' } })
    expect(doc.items).toHaveLength(3)
    // bundle pricing: 3 × 150 = 450 but lineTotal pinned to 400
    expect(doc.items[1]).toMatchObject({ name: '香氛蠟磚', quantity: 3, unitPrice: 150, subtotal: 400 })
    expect(doc.items[2].tags).toEqual(['特典'])
  })

  it('reconciles totals to OpenBooth figures', () => {
    const doc = importOpenBoothOrder(tx, { settings: { shopName: 'Glow' } })
    expect(doc.totals).toMatchObject({ subtotal: 880, discountTotal: 80, total: 800 })
    expect(doc.transaction.receiptNo).toBe('MKT-031')
  })

  it('computes cash change from cashReceived', () => {
    const cash: OpenBoothTx = { ...tx, paymentType: 'cash', paymentMethodName: '現金', cashReceived: 1000, changeGiven: 200 }
    const doc = importOpenBoothOrder(cash)
    expect(doc.payments?.[0]).toMatchObject({ amount: 1000 })
    expect(doc.totals?.change).toBe(200)
  })

  it('carries booth/event context when provided', () => {
    const doc = importOpenBoothOrder(tx, { event: { name: '週末市集', boothName: 'Row B · 7' } })
    expect(doc.event).toMatchObject({ name: '週末市集', boothName: 'Row B · 7' })
  })

  it('leaves shop name empty (logo-only) when none is set', () => {
    const doc = importOpenBoothOrder(tx)
    expect(doc.merchant.name).toBeUndefined()
  })
})

describe('epochToLocalIso', () => {
  it('round-trips to the same instant', () => {
    const ms = Date.parse('2026-06-01T16:05:00+08:00')
    expect(Date.parse(epochToLocalIso(ms))).toBe(ms)
  })
  it('looks like ISO-8601 with an offset', () => {
    expect(epochToLocalIso(0)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })
})

describe('importOrder (generic)', () => {
  it('coerces a loose order and validates', () => {
    const doc = importOrder({
      store: { name: 'Shop' },
      orderId: 42,
      createdAt: '2026-06-01T10:00:00+08:00',
      lineItems: [{ title: 'Widget', qty: 2, price: 50 }],
      tenders: [{ type: 'Cash', amount: 100 }],
    })
    expect(safeValidateReceipt(doc).success).toBe(true)
    expect(doc.items[0]).toMatchObject({ name: 'Widget', quantity: 2, unitPrice: 50 })
  })

  it('falls back to a placeholder item for empty orders', () => {
    expect(importOrder({}).items).toHaveLength(1)
  })
})

describe('applyTemplate', () => {
  it('overlays design while data wins for shop name', () => {
    const doc = importOpenBoothOrder(tx, { settings: { shopName: 'Glow' } })
    const merged = applyTemplate(doc, {
      merchant: { name: 'IGNORED', subtitle: '手作香氛', logo: 'data:image/png;base64,AAAA' },
      message: { title: 'Thank you!' },
      blockOrder: ['items', 'header', 'totals'],
      styleOverrides: { 'totals.total': { color: '#d6336c' } },
    })
    expect(merged.merchant.name).toBe('Glow') // POS data wins
    expect(merged.merchant.subtitle).toBe('手作香氛') // template branding kept
    expect(merged.message).toEqual({ title: 'Thank you!' })
    expect(merged.blockOrder).toEqual(['items', 'header', 'totals'])
    expect(merged.styleOverrides).toEqual({ 'totals.total': { color: '#d6336c' } })
    expect(ensureValid(merged)).toBeTruthy()
  })
})
