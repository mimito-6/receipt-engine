import { describe, expect, it } from 'vitest'
import type { ReceiptDocument } from '@receipt-engine/core'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

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

const baseReceipt: ReceiptDocument = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Mimito Booth' },
  transaction: { receiptNo: 'A-001', issuedAt: '2026-06-01T10:00:00+08:00' },
  items: [{ name: 'Sticker Set', quantity: 1, unitPrice: 100 }],
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

  it('renders the custom theme without throwing', () => {
    expect(() => renderReceiptToSvg(receipt, { theme: 'custom' })).not.toThrow()
  })

  it('renders the thermal theme at a narrower width', () => {
    const svg = renderReceiptToSvg(receipt, { theme: 'thermal' })
    expect(svg).toContain('width="384"')
  })

  it('is deterministic for the same input', () => {
    expect(renderReceiptToSvg(receipt, { theme: 'custom' })).toBe(
      renderReceiptToSvg(receipt, { theme: 'custom' }),
    )
  })

  it('thermal converts embedded images to black & white', () => {
    const withLogo: ReceiptDocument = {
      ...baseReceipt,
      merchant: { ...baseReceipt.merchant, logo: PNG },
    }
    const thermal = renderReceiptToSvg(withLogo, { theme: 'thermal' })
    expect(thermal).toContain('id="re-mono"')
    expect(thermal).toContain('filter="url(#re-mono)"')

    const custom = renderReceiptToSvg(withLogo, { theme: 'custom' })
    expect(custom).not.toContain('re-mono')
  })

  it('renders stickers (emoji + image)', () => {
    const withStickers: ReceiptDocument = {
      ...baseReceipt,
      stickers: [{ content: '🎀' }, { content: PNG }],
    }
    const svg = renderReceiptToSvg(withStickers)
    expect(svg).toContain('🎀')
    expect(svg).toContain('<image')
  })

  it('still renders an image logo', () => {
    const withLogo: ReceiptDocument = {
      ...baseReceipt,
      merchant: { ...baseReceipt.merchant, logo: PNG },
    }
    const svg = renderReceiptToSvg(withLogo, { theme: 'custom' })
    expect(svg).toContain('<image')
  })
})
