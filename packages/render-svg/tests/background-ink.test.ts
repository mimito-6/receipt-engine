// Raising a pale background's opacity lifts it only until opacity clamps at 1 — past that
// the artwork's own tone is the ceiling and the control goes dead. backgroundInkBoost is the
// second lever. It must multiply INK, not luminance: scaling luminance darkens white too, so
// an opaque photo's paper-white areas would print as a solid black slab.
import { describe, expect, it } from 'vitest'
import { renderReceiptToSvg } from '../src/index'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const receipt = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Ink boost' },
  transaction: { receiptNo: '1', issuedAt: '2026-06-01T12:00' },
  items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
  assets: { backgroundImage: PNG, backgroundOpacity: 0.3 },
} as never

/** The feColorMatrix of a <filter id="..."> as 20 numbers, or null if absent. */
function matrix(svg: string, id: string): number[] | null {
  const f = svg.match(new RegExp(`<filter id="${id}"[^>]*>(.*?)</filter>`, 's'))
  if (!f) return null
  const values = f[1]!.match(/values="([^"]+)"/)
  return values ? values[1]!.trim().split(/\s+/).map(Number) : null
}

/** What the matrix maps a uniform grey of `v` (0–1) to, per the R row. */
const mapChannel = (m: number[], v: number): number => m[0]! * v + m[1]! * v + m[2]! * v + m[4]!

describe('backgroundInkBoost', () => {
  it('emits no background filter when unset or at 1', () => {
    expect(matrix(renderReceiptToSvg(receipt, { monochromeImages: true }), 're-bg-ink')).toBeNull()
    expect(
      matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 1 }), 're-bg-ink'),
    ).toBeNull()
  })

  it('keeps white a fixed point — bare paper survives any boost', () => {
    for (const boost of [1.5, 2, 3, 4, 8]) {
      const m = matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: boost }), 're-bg-ink')!
      // This is the whole property: pure white in must be pure white out, or the artwork's
      // paper-coloured areas print as a black slab.
      expect(mapChannel(m, 1)).toBeCloseTo(1, 5)
    }
  })

  it('multiplies ink: a mid grey darkens by exactly the boost', () => {
    const m = matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 3 }), 're-bg-ink')!
    // L' = 1 - K(1 - L). At L = 0.8 and K = 3 that is 1 - 0.6 = 0.4.
    expect(mapChannel(m, 0.8)).toBeCloseTo(0.4, 5)
    // Ink (1 - L) went from 0.2 to 0.6 — three times, as asked.
    expect(1 - mapChannel(m, 0.8)).toBeCloseTo(3 * 0.2, 5)
  })

  it('drives black past saturation rather than overshooting into white', () => {
    const m = matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 4 }), 're-bg-ink')!
    expect(mapChannel(m, 0)).toBeLessThanOrEqual(0) // clamped to black by the renderer
  })

  it('desaturates only when monochrome images were actually requested', () => {
    const mono = matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 2 }), 're-bg-ink')!
    // Luminance rows: every channel contributes to every output channel.
    expect(mono[0]).toBeCloseTo(0.2126 * 2, 6)
    expect(mono[1]).toBeCloseTo(0.7152 * 2, 6)

    const colour = matrix(renderReceiptToSvg(receipt, { monochromeImages: false, backgroundInkBoost: 2 }), 're-bg-ink')!
    // Diagonal: boosting a background must not silently strip its colour.
    expect(colour[0]).toBe(2)
    expect(colour[1]).toBe(0)
    expect(colour[2]).toBe(0)
    expect(colour[6]).toBe(2)
    expect(mapChannel(colour, 1)).toBeCloseTo(1, 5) // white still fixed
  })

  it('leaves alpha untouched, so transparent artwork stays transparent', () => {
    const m = matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 3 }), 're-bg-ink')!
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0])
  })

  it('clamps: below 1 is ignored, above 8 is capped', () => {
    expect(
      matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 0.4 }), 're-bg-ink'),
    ).toBeNull()
    const capped = matrix(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 99 }), 're-bg-ink')!
    expect(capped[4]).toBeCloseTo(1 - 8, 5)
  })

  it('redirects exactly one element — the background image, not the logo', () => {
    const svg = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 2 })
    expect([...svg.matchAll(/url\(#re-bg-ink\)/g)]).toHaveLength(1)
    expect(svg).toMatch(/<image[^>]+filter="url\(#re-bg-ink\)"/)
    // The shared mono filter is still emitted at full strength for everything else.
    const mono = matrix(svg, 're-mono')!
    expect(mono[0]! + mono[1]! + mono[2]!).toBeCloseTo(1, 5)
    expect(mono[4]).toBe(0)
  })

  it('does not disturb the layout — this is tone only', () => {
    const h = (s: string): string => s.match(/viewBox="0 0 \d+ (\d+)"/)![1]!
    expect(h(renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkBoost: 4 }))).toBe(
      h(renderReceiptToSvg(receipt, { monochromeImages: true })),
    )
  })
})
