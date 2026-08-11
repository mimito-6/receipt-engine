// Raising a pale background's opacity lifts it only until opacity clamps at 1 — past that
// the artwork's own grey is the ceiling and the control goes dead. backgroundInkGain is the
// second lever, and it must darken the artwork WITHOUT dragging the logo down with it.
import { describe, expect, it } from 'vitest'
import { renderReceiptToSvg } from '../src/index'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const receipt = {
  schemaVersion: '0.1',
  currency: 'TWD',
  merchant: { name: 'Ink gain' },
  transaction: { receiptNo: '1', issuedAt: '2026-06-01T12:00' },
  items: [{ name: 'Item', quantity: 1, unitPrice: 100 }],
  assets: { backgroundImage: PNG, backgroundOpacity: 0.3, logo: PNG },
} as never

/** The luminance row of a <filter id="..."> feColorMatrix, as numbers. */
function filterRow(svg: string, id: string): number[] | null {
  const f = svg.match(new RegExp(`<filter id="${id}"[^>]*>(.*?)</filter>`, 's'))
  if (!f) return null
  const values = f[1]!.match(/values="([^"]+)"/)
  return values ? values[1]!.trim().split(/\s+/).map(Number) : null
}

describe('backgroundInkGain', () => {
  it('emits no separate background filter when the gain is 1', () => {
    const svg = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 1 })
    expect(filterRow(svg, 're-bg-ink')).toBeNull()
    expect(filterRow(svg, 're-mono')).not.toBeNull()
  })

  it('scales the luminance coefficients by the gain', () => {
    const svg = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 0.5 })
    const row = filterRow(svg, 're-bg-ink')!
    expect(row.slice(0, 3)).toEqual([0.2126 * 0.5, 0.7152 * 0.5, 0.0722 * 0.5])
    // The coefficients must still sum to the gain — rounding them skews the result.
    expect(row[0]! + row[1]! + row[2]!).toBeCloseTo(0.5, 5)
    // Alpha must pass through untouched, or transparent artwork turns into a grey box.
    expect(row[18]).toBe(1)
  })

  it('leaves the shared mono filter at full strength, so the logo is not dragged down', () => {
    const svg = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 0.3 })
    const mono = filterRow(svg, 're-mono')!
    expect(mono[0]! + mono[1]! + mono[2]!).toBeCloseTo(1, 5)
    const bg = filterRow(svg, 're-bg-ink')!
    expect(bg[0]).toBeLessThan(mono[0]!)
  })

  it('points the background image at the darkened filter, not the shared one', () => {
    const plain = renderReceiptToSvg(receipt, { monochromeImages: true })
    expect(plain).toContain('url(#re-mono)')
    expect(plain).not.toContain('re-bg-ink')

    const boosted = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 0.4 })
    // Exactly one element is redirected: the background image itself.
    expect([...boosted.matchAll(/url\(#re-bg-ink\)/g)]).toHaveLength(1)
    expect(boosted).toMatch(/<image[^>]+filter="url\(#re-bg-ink\)"/)
  })

  it('clamps: never brightens, never erases', () => {
    const over = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 4 })
    expect(filterRow(over, 're-bg-ink')).toBeNull() // >1 is treated as untouched

    const zero = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 0 })
    const row = filterRow(zero, 're-bg-ink')!
    expect(row[0]).toBeGreaterThan(0) // floored, so the artwork cannot vanish outright
  })

  it('does not disturb the layout — gain is tone only', () => {
    const a = renderReceiptToSvg(receipt, { monochromeImages: true })
    const b = renderReceiptToSvg(receipt, { monochromeImages: true, backgroundInkGain: 0.25 })
    const h = (s: string): string => s.match(/viewBox="0 0 \d+ (\d+)"/)![1]!
    expect(h(b)).toBe(h(a))
  })
})
