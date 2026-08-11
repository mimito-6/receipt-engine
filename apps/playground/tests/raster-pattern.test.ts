// The raster alignment pattern is the tool used to prove a print head really uses all
// 576 dots, so the pattern itself must be provably correct: exact width, exact
// bytes-per-row, and ink at both extreme columns.
import { describe, expect, it } from 'vitest'
import { rasterTestPattern } from '../src/print-test/fixtures'

/** Is the dot at (x, y) set? Rows are MSB-first, ceil(width/8) bytes each. */
function dot(bmp: ReturnType<typeof rasterTestPattern>, x: number, y: number): boolean {
  const bytesPerRow = Math.ceil(bmp.width / 8)
  return (bmp.data[y * bytesPerRow + (x >> 3)]! & (0x80 >> (x & 7))) !== 0
}

describe('rasterTestPattern', () => {
  it('is exactly the requested dot width with 72 bytes per row at 576', () => {
    const bmp = rasterTestPattern(576)
    expect(bmp.width).toBe(576)
    expect(bmp.data.length).toBe(72 * bmp.height)
  })

  it('is 48 bytes per row at 384', () => {
    const bmp = rasterTestPattern(384)
    expect(bmp.width).toBe(384)
    expect(bmp.data.length).toBe(48 * bmp.height)
  })

  it('inks the very first and very last column — the full-width proof', () => {
    for (const width of [384, 576]) {
      const bmp = rasterTestPattern(width)
      // Row 0 is the solid full-width bar.
      expect(dot(bmp, 0, 0)).toBe(true)
      expect(dot(bmp, width - 1, 0)).toBe(true)
      // The frame's vertical rules also touch both edges.
      expect(dot(bmp, 0, 100)).toBe(true)
      expect(dot(bmp, width - 1, 100)).toBe(true)
    }
  })

  it('fills every byte of the top bar (no partial last byte at 576)', () => {
    const bmp = rasterTestPattern(576)
    // 576 is a multiple of 8, so the solid bar must set every bit of every byte.
    for (let b = 0; b < 72; b++) expect(bmp.data[b]).toBe(0xff)
  })

  it('never writes outside the bitmap', () => {
    const bmp = rasterTestPattern(576)
    expect(bmp.data.length).toBe(72 * bmp.height)
    // Sanity: some ink exists, and the buffer is not accidentally all-black.
    const inked = bmp.data.reduce((n, byte) => n + (byte ? 1 : 0), 0)
    expect(inked).toBeGreaterThan(0)
    expect(inked).toBeLessThan(bmp.data.length)
  })
})
