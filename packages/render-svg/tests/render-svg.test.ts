import { describe, expect, it } from 'vitest'
import type { ReceiptDocument } from '@receipt-engine/core'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const receipt: ReceiptDocument = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Mimito Booth' },
  transaction: { receiptNo: 'A-001', issuedAt: '2026-06-01T10:00:00+08:00' },
  items: [
    { name: 'Sticker <Set>', quantity: 2, unitPrice: 100 },
    { name: 'Mini Zine', quantity: 1, unitPrice: 150 },
  ],
  qr: { value: 'https://example.com', label: 'Follow us' },
  message: { title: 'Thank you!', body: 'See you next event' },
}

describe('renderReceiptToSvg', () => {
  it('renders an SVG document', () => {
    const svg = renderReceiptToSvg(receipt)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
  })

  it('escapes user-supplied text', () => {
    const svg = renderReceiptToSvg(receipt)
    expect(svg).toContain('Sticker &lt;Set&gt;')
    expect(svg).not.toContain('Sticker <Set>')
  })

  it('includes the merchant name', () => {
    expect(renderReceiptToSvg(receipt)).toContain('Mimito Booth')
  })

  it('includes item names', () => {
    const svg = renderReceiptToSvg(receipt)
    expect(svg).toContain('Mini Zine')
  })

  it('includes a QR block only when qr is provided', () => {
    const withQr = renderReceiptToSvg(receipt)
    const withoutQr = renderReceiptToSvg({ ...receipt, qr: undefined })
    expect(withQr).toContain('shape-rendering="crispEdges"')
    expect(withQr).toContain('Follow us')
    expect(withoutQr).not.toContain('shape-rendering="crispEdges"')
  })

  it('renders the cute theme without throwing', () => {
    expect(() => renderReceiptToSvg(receipt, { theme: 'cute' })).not.toThrow()
  })

  it('renders the thermal theme at a narrower width', () => {
    const svg = renderReceiptToSvg(receipt, { theme: 'thermal' })
    expect(svg).toContain('width="384"')
  })

  it('is deterministic for the same input', () => {
    expect(renderReceiptToSvg(receipt, { theme: 'cute' })).toBe(
      renderReceiptToSvg(receipt, { theme: 'cute' }),
    )
  })
})
