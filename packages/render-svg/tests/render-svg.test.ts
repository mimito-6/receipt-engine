import { describe, expect, it } from 'vitest'
import type { ReceiptDocument } from '@receipt-engine/core'
import { getTheme } from '@receipt-engine/themes'
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

  it('escapes a malicious styleOverrides weight (no XSS / attribute breakout)', () => {
    const svg = renderReceiptToSvg({
      ...receipt,
      styleOverrides: { 'merchant.name': { weight: '700"><script>alert(1)</script><text x="0' } },
    })
    expect(svg).not.toContain('<script>') // payload neutralized
    expect(svg).toContain('&lt;script&gt;') // escaped instead
    // a legitimate numeric weight still serializes normally
    expect(renderReceiptToSvg({ ...receipt, styleOverrides: { 'merchant.name': { weight: 700 } } })).toContain(
      'font-weight="700"',
    )
  })

  it('honors a currencySymbol override (and the code→symbol table)', () => {
    // override wins even for a code outside the built-in table
    expect(renderReceiptToSvg({ ...baseReceipt, currency: 'MYR', currencySymbol: 'RM' })).toContain('RM100')
    // a known code with no override still uses the table
    expect(renderReceiptToSvg({ ...baseReceipt, currency: 'TWD' })).toContain('NT$100')
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

  it('background scales continuously (no jump at 100%) and keeps its aspect ratio', () => {
    const cardWidth = 720 - 52
    const at = (assets: Record<string, unknown>): string =>
      renderReceiptToSvg(
        { ...baseReceipt, assets: { backgroundImage: PNG, ...assets } },
        { theme: 'custom', width: 720 },
      )
    const w = (s: number): number =>
      parseFloat(at({ backgroundScale: s }).match(/<image[^>]*\swidth="([\d.]+)"/)![1])
    // width tracks scale LINEARLY across the 1.0 boundary — the 95%↔100% size jump is gone
    expect(w(0.95)).toBeCloseTo(cardWidth * 0.95, 0)
    expect(w(1.0)).toBeCloseTo(cardWidth * 1.0, 0)
    expect(w(1.05)).toBeCloseTo(cardWidth * 1.05, 0)
    expect(Math.abs(w(1.0) - w(0.95))).toBeLessThan(cardWidth * 0.1) // continuous, not a cliff
    // full range with one consistent fit mode (whole image, never force-cropped/distorted)
    expect(w(0.3)).toBeCloseTo(cardWidth * 0.3, 0)
    expect(w(8)).toBeCloseTo(cardWidth * 8, 0)
    expect(at({ backgroundScale: 0.5 })).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(at({ backgroundScale: 2 })).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('QR backing is white by default and can be set transparent', () => {
    const def = renderReceiptToSvg({ ...baseReceipt, qr: { value: 'https://x' } })
    expect(def).toContain('fill="#ffffff"') // default white backing (stays scannable)
    const trans = renderReceiptToSvg({ ...baseReceipt, qr: { value: 'https://x', background: 'transparent' } })
    expect(trans).toContain('fill="transparent"')
    expect(trans).not.toContain('fill="#ffffff"')
  })

  it('rotates the background image around its centre when backgroundRotation is set', () => {
    const rotated = renderReceiptToSvg(
      { ...baseReceipt, assets: { backgroundImage: PNG, backgroundRotation: 30 } },
      { theme: 'custom', width: 720 },
    )
    expect(rotated).toMatch(/<image[^>]*transform="rotate\(30 /) // rotate(deg cx cy)
    // no transform when rotation is unset/zero
    expect(renderReceiptToSvg({ ...baseReceipt, assets: { backgroundImage: PNG } }, { theme: 'custom' })).not.toContain(
      'transform="rotate(',
    )
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

  it('monochromeImages overrides the theme default', () => {
    const withLogo: ReceiptDocument = { ...baseReceipt, merchant: { ...baseReceipt.merchant, logo: PNG } }
    // custom is colour by default — forcing mono adds the grayscale filter
    expect(renderReceiptToSvg(withLogo, { theme: 'custom', monochromeImages: true })).toContain('filter="url(#re-mono)"')
    // thermal is mono by default — forcing colour removes it
    expect(renderReceiptToSvg(withLogo, { theme: 'thermal', monochromeImages: false })).not.toContain('re-mono')
  })

  it('transparentBackground drops ONLY the page background, keeps the card', () => {
    const withBg: ReceiptDocument = { ...baseReceipt, assets: { backgroundImage: PNG } }
    const bg = getTheme('custom').palette.background
    const surface = getTheme('custom').palette.surface
    const normal = renderReceiptToSvg(withBg, { theme: 'custom' })
    const clean = renderReceiptToSvg(withBg, { theme: 'custom', transparentBackground: true })
    // page background (the desk) is removed on a clean export…
    expect(normal).toContain(`fill="${bg}"`)
    expect(clean).not.toContain(`fill="${bg}"`)
    // …but the card itself is kept: its surface fill + its background image stay
    expect(clean).toContain(`fill="${surface}"`)
    expect(clean).toContain('preserveAspectRatio="xMidYMid meet"') // card bg image kept
  })

  it('perforatedEdges overrides the theme + renders a torn silhouette', () => {
    const flat = renderReceiptToSvg(baseReceipt, { theme: 'custom' })
    const torn = renderReceiptToSvg(baseReceipt, { theme: 'custom', perforatedEdges: true })
    // custom is flat by default → no torn silhouette
    expect(flat).not.toContain('stroke-linejoin="round"')
    // forcing edges on yields the torn card path (more geometry than a plain rect)
    expect(torn).toContain('stroke-linejoin="round"')
    expect(torn.length).toBeGreaterThan(flat.length)
    // thermal is torn by default → forcing off falls back to a plain rect card
    expect(renderReceiptToSvg(baseReceipt, { theme: 'thermal', perforatedEdges: false })).not.toContain(
      'stroke-linejoin="round"',
    )
  })

  it('torn edges survive a clean export: torn card kept, page background dropped', () => {
    const surface = getTheme('thermal').palette.surface
    const bg = getTheme('thermal').palette.background
    // thermal has perforatedEdges by default
    const clean = renderReceiptToSvg(baseReceipt, { theme: 'thermal', transparentBackground: true })
    expect(clean).not.toContain(`fill="${bg}"`) // page background (the desk) dropped
    expect(clean).toContain(`fill="${surface}"`) // torn card keeps its surface colour
    // edges off → a plain rect card instead of the torn silhouette path
    expect(renderReceiptToSvg(baseReceipt, { theme: 'thermal' })).not.toBe(
      renderReceiptToSvg(baseReceipt, { theme: 'thermal', perforatedEdges: false }),
    )
  })

  it('expands legacy block keys (header → logo/name/subtitle)', () => {
    // an old saved config still renders without dropping content
    const svg = renderReceiptToSvg({ ...receipt, blockOrder: ['message', 'header', 'qr', 'items'] })
    expect(svg).toContain('Mimito Booth')
    expect(svg).toContain('Thank you!')
    expect(svg.indexOf('Thank you!')).toBeLessThan(svg.indexOf('Mimito Booth'))
  })
})
