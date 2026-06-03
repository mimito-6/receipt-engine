import { describe, expect, it } from 'vitest'
import type { ReceiptDocument } from '@receipt-engine/core'
import { renderReceiptToHtml } from '@receipt-engine/render-html'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const receipt: ReceiptDocument = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Mimito Booth' },
  transaction: { receiptNo: 'A-001', issuedAt: '2026-06-01T10:00:00+08:00' },
  items: [{ name: 'Sticker', quantity: 1, unitPrice: 100 }],
}

describe('renderReceiptToHtml', () => {
  it('wraps the receipt SVG in a standalone document', () => {
    const html = renderReceiptToHtml(receipt)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<svg')
  })

  it('forwards the clean/transparent export (drops the page chrome)', () => {
    const normal = renderReceiptToHtml(receipt)
    const clean = renderReceiptToHtml(receipt, { transparentBackground: true })
    expect(normal).toContain('background: #e9e9ee') // desk shown normally
    expect(clean).toContain('background: transparent') // desk dropped on a clean export
    expect(clean).not.toContain('drop-shadow') // card shadow dropped too
  })

  it('forwards monochromeImages + perforatedEdges into the embedded SVG', () => {
    const withLogo: ReceiptDocument = { ...receipt, merchant: { ...receipt.merchant, logo: PNG } }
    // custom theme is colour by default → forcing mono adds the grayscale filter
    expect(renderReceiptToHtml(withLogo, { theme: 'custom', monochromeImages: true })).toContain('re-mono')
    // torn edges on the custom theme → the silhouette path marker appears
    expect(renderReceiptToHtml(receipt, { theme: 'custom', perforatedEdges: true })).toContain(
      'stroke-linejoin="round"',
    )
  })
})
