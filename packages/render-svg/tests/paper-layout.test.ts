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

// The outer margin is the desk the card sits on. Paper has no desk — there it is spent width
// on a fixed-width head, and every dot of it shrinks the type by the same proportion.
describe('cropToCard', () => {
  const design = {
    ...(receipt as object),
    assets: { backgroundImage: 'data:image/png;base64,iVBORw0KGgo=' },
  } as never

  const box = (svg: string): number[] => svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number)

  it('windows the viewBox onto the card instead of the page', () => {
    const full = renderReceiptToSvg(design, {})
    const cropped = renderReceiptToSvg(design, { cropToCard: true })
    const [fx, fy, fw, fh] = box(full)
    const [cx, cy, cw, ch] = box(cropped)
    expect([fx, fy]).toEqual([0, 0])
    // The window starts at the card and is smaller than the page on both axes.
    expect(cx).toBeGreaterThan(0)
    expect(cy).toBeGreaterThan(0)
    expect(cw).toBeLessThan(fw)
    expect(ch).toBeLessThan(fh)
    // width/height attributes must track the window, or the rasterizer scales the wrong box.
    expect(cropped).toContain(`width="${cw}"`)
    expect(cropped).toContain(`height="${ch}"`)
  })

  it('re-windows only — every element keeps the coordinates the design gave it', () => {
    const full = renderReceiptToSvg(design, {})
    const cropped = renderReceiptToSvg(design, { cropToCard: true })
    const body = (s: string): string => s.slice(s.indexOf('>') + 1)
    expect(body(cropped)).toBe(body(full))
  })

  it('reports the cropped size as the metadata, since that is what gets printed', () => {
    const full = renderReceiptWithMetadata(design, { theme: 'thermal', paper: PAPER_80 }).metadata
    const cropped = renderReceiptWithMetadata(design, {
      theme: 'thermal',
      paper: PAPER_80,
      cropToCard: true,
    }).metadata
    // PAPER_80 already has a zero outer margin, so cropping must be a no-op there — the fix
    // that removed that margin must not be double-applied.
    expect(cropped.widthDots).toBe(full.widthDots)
    expect(cropped.heightDots).toBe(full.heightDots)
  })

  it('gives the card the whole print width', () => {
    // The point of cropping: on a fixed-width head, width the card does not occupy is width
    // the type does not get. Before, the card is inset; after, it spans the window exactly.
    const cardWidth = (svg: string): number =>
      Number(svg.match(/<rect x="(?:[\d.]+)" y="(?:[\d.]+)" width="([\d.]+)"[^>]*rx=/)![1])

    const full = renderReceiptToSvg(design, {})
    const cropped = renderReceiptToSvg(design, { cropToCard: true })
    expect(cardWidth(full) / box(full)[2]!).toBeLessThan(1)
    expect(cardWidth(cropped) / box(cropped)[2]!).toBe(1)
    // Which is a real gain in type size, not a rounding artefact.
    expect(box(full)[2]! / box(cropped)[2]!).toBeGreaterThan(1.05)
  })

  it('makes a tall receipt taller in proportion, as the paper sees it', () => {
    const tall = {
      ...(design as object),
      items: Array.from({ length: 30 }, (_, i) => ({ name: `Item ${i}`, quantity: 1, unitPrice: 100 })),
    } as never
    const [, , fw, fh] = box(renderReceiptToSvg(tall, {}))
    const [, , cw, ch] = box(renderReceiptToSvg(tall, { cropToCard: true }))
    expect(ch / cw).toBeGreaterThan(fh / fw)
  })

  it('is off by default (back-compat)', () => {
    expect(box(renderReceiptToSvg(design, {})).slice(0, 2)).toEqual([0, 0])
  })
})
