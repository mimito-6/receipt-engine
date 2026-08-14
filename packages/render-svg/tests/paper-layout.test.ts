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

// The logo box was a constant, so a mark that came out too small or too dominant could not be
// adjusted at all without editing the theme.
describe('logo scale', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='
  const withLogo = (logoScale?: number) =>
    ({
      schemaVersion: '0.1',
      currency: 'TWD',
      merchant: { name: 'Scale', logo: PNG, ...(logoScale != null ? { logoScale } : {}) },
      transaction: { receiptNo: '1', issuedAt: '2026-06-01T12:00' },
      items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
    }) as never

  /** Width and height of the logo <image> as drawn. */
  function logoRect(svg: string): { w: number; h: number } {
    const m = svg.match(/<image[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/)!
    return { w: Number(m[1]), h: Number(m[2]) }
  }

  it('scales the mark, keeping the box proportions', () => {
    const base = logoRect(renderReceiptToSvg(withLogo(), {}))
    const big = logoRect(renderReceiptToSvg(withLogo(2), {}))
    expect(big.w / base.w).toBeCloseTo(2, 3)
    expect(big.h / base.h).toBeCloseTo(2, 3)
    // Aspect is preserved, so the mark is never stretched.
    expect(big.w / big.h).toBeCloseTo(base.w / base.h, 5)
  })

  it('shrinks as well as grows', () => {
    const small = logoRect(renderReceiptToSvg(withLogo(0.5), {}))
    const base = logoRect(renderReceiptToSvg(withLogo(), {}))
    expect(small.w).toBeLessThan(base.w)
    expect(small.w / base.w).toBeCloseTo(0.5, 3)
  })

  it('never lets the mark grow past the sheet', () => {
    const svg = renderReceiptToSvg(withLogo(99), {})
    const width = Number(svg.match(/viewBox="0 0 (\d+)/)![1])
    const { w } = logoRect(svg)
    expect(w).toBeLessThanOrEqual(width)
  })

  it('is a no-op when unset, so existing designs are untouched', () => {
    expect(renderReceiptToSvg(withLogo(), {})).toBe(renderReceiptToSvg(withLogo(1), {}))
  })
})

// "Booth" was hardcoded in front of the booth number, so a receipt could carry the number or
// nothing, but never the number without an English word attached to it.
describe('booth prefix', () => {
  const withEvent = (event: Record<string, unknown>) =>
    ({
      schemaVersion: '0.1',
      currency: 'TWD',
      merchant: { name: 'Stall' },
      transaction: { receiptNo: '1', issuedAt: '2026-06-01T12:00' },
      items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
      event,
    }) as never

  const textOf = (svg: string): string =>
    [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1]).join(' | ')

  it('keeps the historical wording when no prefix is given', () => {
    expect(textOf(renderReceiptToSvg(withEvent({ boothNumber: 'A12' }), {}))).toContain('Booth A12')
  })

  it('prints the number alone when the prefix is cleared', () => {
    const out = textOf(renderReceiptToSvg(withEvent({ boothNumber: 'A12', boothLabel: '' }), {}))
    expect(out).toContain('A12')
    expect(out).not.toContain('Booth')
  })

  it('uses whatever word the design asks for', () => {
    const out = textOf(renderReceiptToSvg(withEvent({ boothNumber: 'A12', boothLabel: '攤位' }), {}))
    expect(out).toContain('攤位 A12')
    expect(out).not.toContain('Booth')
  })

  it('does not print a stray prefix when there is no number', () => {
    const out = textOf(renderReceiptToSvg(withEvent({ boothLabel: 'Booth', name: 'Artist Alley' }), {}))
    expect(out).toContain('Artist Alley')
    expect(out).not.toContain('Booth')
  })
})

// Per-content print settings need the logo separable from the text it sits among. Blocks
// interleave them, so the split happens at the painter — but the geometry must be computed in
// full regardless, or the layers stop lining up when they are combined.
describe('logo as its own layer', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='
  const doc = {
    schemaVersion: '0.1',
    currency: 'TWD',
    merchant: { name: 'Stall', logo: PNG },
    transaction: { receiptNo: '1', issuedAt: '2026-06-01T12:00' },
    items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
  } as never

  const images = (svg: string): string[] => [...svg.matchAll(/<image\b[^>]*>/g)].map((m) => m[0])
  const texts = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*>/g)].map((m) => m[0])
  const height = (svg: string): string => svg.match(/viewBox="0 0 \d+ (\d+)"/)![1]!

  it('draws the logo alone when only that layer is asked for', () => {
    const svg = renderReceiptToSvg(doc, { layers: ['logo'] })
    expect(images(svg)).toHaveLength(1)
    expect(texts(svg)).toHaveLength(0)
  })

  it('draws the text without the logo when only content is asked for', () => {
    const svg = renderReceiptToSvg(doc, { layers: ['content'] })
    expect(images(svg)).toHaveLength(0)
    expect(texts(svg).length).toBeGreaterThan(0)
  })

  it('keeps identical geometry across every layer, so they can be combined', () => {
    const full = height(renderReceiptToSvg(doc, {}))
    for (const layers of [['logo'], ['content'], ['content', 'logo'], ['stickers']] as const) {
      expect(height(renderReceiptToSvg(doc, { layers: [...layers] })), `layers ${layers}`).toBe(full)
    }
  })

  it('places the logo at the same coordinates whether or not the text is drawn', () => {
    const alone = images(renderReceiptToSvg(doc, { layers: ['logo'] }))[0]!
    const together = images(renderReceiptToSvg(doc, { layers: ['content', 'logo'] }))[0]!
    const xy = (t: string) => t.match(/x="([\d.]+)" y="([\d.]+)"/)!.slice(1, 3).join(',')
    expect(xy(alone)).toBe(xy(together))
  })
})
