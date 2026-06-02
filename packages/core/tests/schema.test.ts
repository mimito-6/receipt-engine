import { describe, expect, it } from 'vitest'
import {
  ReceiptValidationError,
  safeValidateReceipt,
  validateReceipt,
  type ReceiptDocument,
} from '@receipt-engine/core'

const validReceipt: ReceiptDocument = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Test Shop' },
  transaction: { receiptNo: 'R-001', issuedAt: '2026-06-01T10:00:00+08:00' },
  items: [{ name: 'Coffee', quantity: 1, unitPrice: 120 }],
}

describe('validateReceipt', () => {
  it('accepts a valid receipt', () => {
    expect(() => validateReceipt(validReceipt)).not.toThrow()
    const parsed = validateReceipt(validReceipt)
    expect(parsed.merchant.name).toBe('Test Shop')
  })

  it('allows an empty or omitted merchant name (logo-only branding)', () => {
    expect(() => validateReceipt({ ...validReceipt, merchant: { name: '' } })).not.toThrow()
    expect(safeValidateReceipt({ ...validReceipt, merchant: {} }).success).toBe(true)
  })

  it('fails when item quantity is <= 0', () => {
    const bad = {
      ...validReceipt,
      items: [{ name: 'Sticker', quantity: 0, unitPrice: 50 }],
    }
    const result = safeValidateReceipt(bad)
    expect(result.success).toBe(false)
    const issue = result.error?.issues.find((i) => i.path === 'items[0].quantity')
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('greater than 0')
  })

  it('produces a readable formatted error', () => {
    const result = safeValidateReceipt({ schemaVersion: '0.1' })
    expect(result.success).toBe(false)
    expect(result.error?.format()).toContain('currency')
  })
})
