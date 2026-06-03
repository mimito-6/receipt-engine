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

  it('applies per-element styleOverrides by id', () => {
    const styled = renderReceiptToSvg({
      ...receipt,
      styleOverrides: { 'totals.total': { color: '#123456' } },
    })
    expect(styled).toContain('fill="#123456"')
    expect(renderReceiptToSvg(receipt)).not.toContain('#123456')
  })

  it('honors blockOrder (message before header)', () => {
    const reordered = renderReceiptToSvg({
      ...receipt,
      blockOrder: ['message', 'header', 'transaction', 'items', 'totals'],
    })
    expect(reordered.indexOf('Thank you!')).toBeLessThan(reordered.indexOf('Mimito Booth'))
    // default order keeps the merchant name above the message
    const def = renderReceiptToSvg(receipt)
    expect(def.indexOf('Mimito Booth')).toBeLessThan(def.indexOf('Thank you!'))
  })

  it('background image always covers the card, even when panned', () => {
    const withBg: ReceiptDocument = {
      ...baseReceipt,
      assets: { backgroundImage: PNG, backgroundX: 200, backgroundY: -150, backgroundScale: 1 },
    }
    const svg = renderReceiptToSvg(withBg, { theme: 'custom', width: 720 })
    const m = svg.match(
      /<image href="[^"]*" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" preserveAspectRatio="xMidYMid slice"/,
    )
    expect(m).toBeTruthy()
    const x = parseFloat(m![1])
    const y = parseFloat(m![2])
    const w = parseFloat(m![3])
    const cardX = 26 // outerMargin (custom)
    const cardWidth = 720 - 52
    // covers the full card horizontally despite the pan — no blank gap exposed
    expect(x).toBeLessThanOrEqual(cardX)
    expect(x + w).toBeGreaterThanOrEqual(cardX + cardWidth)
    // panned up → the image top is above the card top (so the top can't gap)
    expect(y).toBeLessThanOrEqual(26)
  })

  it('tags elements only in interactive mode', () => {
    const interactive = renderReceiptToSvg(receipt, { interactive: true })
    expect(interactive).toContain('data-re-block="body"')
    expect(interactive).toContain('data-re-id="merchant.name"')
    expect(renderReceiptToSvg(receipt)).not.toContain('data-re-')
  })

  it('reorders fine-grained units (subtitle above name)', () => {
    const doc: ReceiptDocument = {
      ...receipt,
      merchant: { name: 'ShopName', subtitle: 'TagLine' },
      blockOrder: ['subtitle', 'name'],
    }
    const svg = renderReceiptToSvg(doc)
    expect(svg.indexOf('TagLine')).toBeLessThan(svg.indexOf('ShopName'))
    // default keeps the name above the subtitle
    const def = renderReceiptToSvg({ ...doc, blockOrder: undefined })
    expect(def.indexOf('ShopName')).toBeLessThan(def.indexOf('TagLine'))
  })

  it('groups transaction/items/totals/payments into one body unit + splits qr/message', () => {
    const svg = renderReceiptToSvg(receipt, { interactive: true })
    expect((svg.match(/data-re-block="body"/g) || []).length).toBe(1)
    expect(svg).not.toContain('data-re-block="items"')
    expect(svg).not.toContain('data-re-block="totals"')
    expect(svg).toContain('data-re-block="qrImage"')
    expect(svg).toContain('data-re-block="qrLabel"')
    expect(svg).toContain('data-re-block="messageTitle"')
    expect(svg).toContain('data-re-block="messageBody"')
  })

  it('expands legacy block keys (header → logo/name/subtitle)', () => {
    // an old saved config still renders without dropping content
    const svg = renderReceiptToSvg({ ...receipt, blockOrder: ['message', 'header', 'qr', 'items'] })
    expect(svg).toContain('Mimito Booth')
    expect(svg).toContain('Thank you!')
    expect(svg.indexOf('Thank you!')).toBeLessThan(svg.indexOf('Mimito Booth'))
  })
})
