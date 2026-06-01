import { describe, expect, it } from 'vitest'
import { calculateTotals, itemSubtotal } from '@receipt-engine/core'

describe('itemSubtotal', () => {
  it('auto-calculates quantity * unitPrice when subtotal is absent', () => {
    expect(itemSubtotal({ name: 'A', quantity: 3, unitPrice: 50 })).toBe(150)
  })

  it('respects an explicitly provided subtotal', () => {
    expect(itemSubtotal({ name: 'A', quantity: 3, unitPrice: 50, subtotal: 140 })).toBe(140)
  })
})

describe('calculateTotals', () => {
  it('sums item subtotals', () => {
    const totals = calculateTotals([
      { name: 'A', quantity: 2, unitPrice: 100 },
      { name: 'B', quantity: 1, unitPrice: 80 },
    ])
    expect(totals.subtotal).toBe(280)
    expect(totals.discountTotal).toBe(0)
    expect(totals.total).toBe(280)
  })

  it('subtracts discounts from the total', () => {
    const totals = calculateTotals(
      [{ name: 'A', quantity: 1, unitPrice: 500 }],
      [{ label: 'Member', amount: 50 }],
    )
    expect(totals.subtotal).toBe(500)
    expect(totals.discountTotal).toBe(50)
    expect(totals.total).toBe(450)
  })
})
