// A thermal receipt must use the FULL print head. Wasted margin is wasted paper on every
// receipt, and it was a real defect: an 80mm print came out visibly narrower than the roll.
import { describe, expect, it } from 'vitest'
import { PAPER_58, PAPER_80 } from '@receipt-engine/core'
import { renderReceiptToSvg, renderReceiptWithMetadata } from '../src/index'

const receipt = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Full width test' },
  transaction: { receiptNo: '1', issuedAt: '2026-06-01T12:00' },
  items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
} as never

describe('paper profile layout', () => {
  it('renders an 80mm receipt at 576 dots wide', () => {
    const svg = renderReceiptToSvg(receipt, { theme: 'thermal', paper: PAPER_80 })
    expect(svg).toContain('width="576"')
    expect(svg).toContain('viewBox="0 0 576')
  })

  it('renders a 58mm receipt at 384 dots wide', () => {
    const svg = renderReceiptToSvg(receipt, { theme: 'thermal', paper: PAPER_58 })
    expect(svg).toContain('width="384"')
  })

  it('spans the card edge-to-edge — no wasted outer margin on either paper', () => {
    for (const paper of [PAPER_58, PAPER_80]) {
      const svg = renderReceiptToSvg(receipt, { theme: 'thermal', paper })
      // The card is the first <rect> after any background; with outerMargin 0 it must start
      // at x=0 and be exactly the paper width.
      const rects = [...svg.matchAll(/<rect[^>]*>/g)].map((m) => m[0])
      const card = rects.find((r) => r.includes(`width="${paper.printableWidthDots}"`))
      expect(card, `no full-width rect for ${paper.id}`).toBeTruthy()
      expect(card).toMatch(/x="0"/)
    }
  })

  it('reports metadata that matches the profile', () => {
    const { metadata } = renderReceiptWithMetadata(receipt, { theme: 'thermal', paper: PAPER_80 })
    expect(metadata.widthDots).toBe(576)
    expect(metadata.bytesPerRow).toBe(72)
    expect(metadata.dpi).toBe(203)
    // 12mm of feed is included in the paper cost.
    expect(metadata.feedAfterPrintMm).toBe(12)
    expect(metadata.heightDots).toBeGreaterThan(0)
    expect(metadata.estimatedReceiptsPerRoll).toBeGreaterThan(0)
  })

  it('re-lays out rather than scaling: 384 and 576 differ in height, not just width', () => {
    const a = renderReceiptWithMetadata(receipt, { theme: 'thermal', paper: PAPER_58 }).metadata
    const b = renderReceiptWithMetadata(receipt, { theme: 'thermal', paper: PAPER_80 }).metadata
    expect(a.widthDots).toBe(384)
    expect(b.widthDots).toBe(576)
    // A pure upscale would keep the aspect ratio identical; a real re-layout does not.
    expect(b.heightDots / b.widthDots).not.toBeCloseTo(a.heightDots / a.widthDots, 3)
  })

  it('leaves profile-less rendering untouched (back-compat)', () => {
    const svg = renderReceiptToSvg(receipt, { theme: 'thermal' })
    expect(svg).toContain('width="384"')
  })
})
